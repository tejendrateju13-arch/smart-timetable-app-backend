const { db, admin } = require('../config/firebase');

// Helper to delete collection in batches (Firestore doesn't support recursive delete easily from client SDKs, but Admin SDK has tools or we batch)
async function deleteCollection(collectionRef, batchSize) {
    const query = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(db, query, resolve).catch(reject);
    });
}

async function deleteQueryBatch(db, query, resolve) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        // When there are no documents left, we are done
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();

    // Recurse on the next process tick, to avoid
    // exploding the stack.
    process.nextTick(() => {
        deleteQueryBatch(db, query, resolve);
    });
}

// 1. Delete Timetables
exports.deleteTimetables = async (req, res) => {
    try {
        const { departmentId } = req.query; // If passed (HOD scope), else delete all if Admin

        // If HOD, strict scope check
        if (req.user.role === 'HOD') {
            if (!req.user.departmentId) return res.status(403).json({ message: "HOD has no department assigned." });
            // Delete only matching dept timetables
            // Since deleteCollection is for whole collection, we need a specific query delete loop
            // Optimization: Get docs and batch delete
            const snapshot = await db.collection('timetables').where('metaData.departmentId', '==', req.user.departmentId).get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            return res.json({ message: `Timetables for department ${req.user.departmentId} deleted.` });
        }

        // If Admin, checks if they want specific delete or ALL
        if (departmentId) {
            const snapshot = await db.collection('timetables').where('metaData.departmentId', '==', departmentId).get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            return res.json({ message: `Timetables for department ${departmentId} deleted.` });
        }

        // DELETE ALL
        await deleteCollection(db.collection('timetables'), 100);
        res.json({ message: "All Timetables deleted successfully." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// 2. Delete Notifications
exports.deleteNotifications = async (req, res) => {
    try {
        // Safe Delete: admin clears all, HOD clears their own/dept related?
        // Usually notifications are personal or broadcast.
        // Let's assume this is "System Cleanup".

        if (req.user.role === 'HOD') {
            // For HOD, maybe just delete notifications WHERE strict recipient is them or their dept staff?
            // Difficult to filter "Dept staff" without lookup.
            // Simpler: Delete notifications sent TO me or BY me?
            // The request asks for "features like... notifications". Likely clearing system clutter.
            // Let's allow HOD to clear notifications where THEY are the recipient, or "Broadacst to Dept".
            return res.status(403).json({ message: "Global notification clear is Admin only. You can clear your own." });
        }

        await deleteCollection(db.collection('notifications'), 100);
        res.json({ message: "All System Notifications deleted." });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 3. Delete Users
exports.deleteUsers = async (req, res) => {
    try {
        const { role } = req.query; // 'student', 'faculty', or 'all'

        // Safety: Prevent deleting self
        const myUid = req.user.uid;

        let query = db.collection('users');
        if (req.user.role === 'HOD') {
            query = query.where('departmentId', '==', req.user.departmentId).where('role', 'in', ['student', 'faculty']);
        } else if (role && role !== 'all') {
            query = query.where('role', '==', role);
        } else {
            // Admin deleting ALL: Filter out Admins to prevent lockout?
            // Better to query non-admins
            query = query.where('role', '!=', 'admin');
        }

        const snapshot = await query.get();
        const batch = db.batch();
        let deletedCount = 0;

        // Note: This only deletes from Firestore 'users' collection. 
        // Real cleanup requires `admin.auth().deleteUser(uid)`.

        const deletePromises = snapshot.docs.map(async (doc) => {
            const userData = doc.data();
            if (userData.uid === myUid) return; // Skip self

            // Delete from Auth
            if (userData.uid) {
                try {
                    await admin.auth().deleteUser(userData.uid);
                } catch (e) {
                    console.log(`Failed to delete auth user ${userData.uid}: ${e.message}`);
                    // Continue to delete data anyway
                }
            }
            // Delete from Firestore
            batch.delete(doc.ref);

            // Cleanup separate collections if they exist (faculty/students)?
            // Yes, we should try to clean 'faculty' and 'students' collections too.
            // But doing that in one go is hard.
            // Let's rely on the separate collections usually just linking or being duplicates.
            // Ideally we need to find them matchingly.

            deletedCount++;
        });

        await Promise.all(deletePromises);
        await batch.commit();

        // Also clean 'faculty' and 'students' collections if 'all' or specific role
        // This is a "Reset" feature, so aggressive delete is expected.
        if (!req.user.departmentId) { // Admin
            if (role === 'faculty' || role === 'all') await deleteCollection(db.collection('faculty'), 100);
            if (role === 'student' || role === 'all') await deleteCollection(db.collection('students'), 100);
        } else {
            // HOD Scope
            // Delete faculty in dept
            const facSnap = await db.collection('faculty').where('departmentId', '==', req.user.departmentId).get();
            facSnap.forEach(d => d.ref.delete());

            // Delete students in dept
            const stuSnap = await db.collection('students').where('departmentId', '==', req.user.departmentId).get();
            stuSnap.forEach(d => d.ref.delete());
        }

        res.json({ message: `Deleted ${deletedCount} users and associated records.` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// 4. Delete Rearrangements
exports.deleteRearrangements = async (req, res) => {
    try {
        const { departmentId, date } = req.query; // Optional filters

        let query = db.collection('rearrangements');

        if (req.user.role === 'HOD') {
            // HOD Scope: Only their department
            query = query.where('departmentId', '==', req.user.departmentId);
        } else if (departmentId) {
            query = query.where('departmentId', '==', departmentId);
        }

        if (date) {
            query = query.where('date', '==', date);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
            return res.json({ message: "No rearrangement records found to delete." });
        }

        // Batch Delete
        // Since strict limit might be needed, we use helper or just standard batch
        // Using helper deleteCollection if no filters, but here we have filters.
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        res.json({ message: `Successfully deleted ${snapshot.size} rearrangement requests.` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// 5. Force Reset (Nuclear Option)
exports.resetSystem = async (req, res) => {
    // ...
};
