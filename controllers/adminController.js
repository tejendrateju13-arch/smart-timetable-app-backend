const { db, admin } = require('../config/firebase');

// Helper to chunk arrays
const chunkArray = (array, size) => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
        chunked.push(array.slice(i, i + size));
    }
    return chunked;
};

// Helper: Delete documents in batches of 400 (safe limit < 500)
async function deleteDocsInBatches(docs) {
    if (docs.length === 0) return;

    // Chunk documents
    const chunks = chunkArray(docs, 400);

    for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
}

// Helper to delete collection (Recursive / Query Based)
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
        resolve();
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();

    process.nextTick(() => {
        deleteQueryBatch(db, query, resolve);
    });
}

// 1. Delete Timetables
exports.deleteTimetables = async (req, res) => {
    try {
        const { departmentId } = req.query;

        // HOD: Delete only their dept timetables
        if (req.user.role === 'HOD') {
            if (!req.user.departmentId) return res.status(403).json({ message: "HOD has no department assigned." });

            const snapshot = await db.collection('timetables').where('metaData.departmentId', '==', req.user.departmentId).get();
            await deleteDocsInBatches(snapshot.docs);

            return res.json({ message: `Timetables for department ${req.user.departmentId} deleted.` });
        }

        // Admin: Specific Dept or ALL
        if (departmentId) {
            const snapshot = await db.collection('timetables').where('metaData.departmentId', '==', departmentId).get();
            await deleteDocsInBatches(snapshot.docs);

            return res.json({ message: `Timetables for department ${departmentId} deleted.` });
        }

        // DELETE ALL
        await deleteCollection(db.collection('timetables'), 400);
        res.json({ message: "All Timetables deleted successfully." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// 2. Delete Notifications
exports.deleteNotifications = async (req, res) => {
    try {
        if (req.user.role === 'HOD') {
            return res.status(403).json({ message: "Global notification clear is Admin only. You can clear your own." });
        }

        await deleteCollection(db.collection('notifications'), 400);
        res.json({ message: "All System Notifications deleted." });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 3. Delete Users
exports.deleteUsers = async (req, res) => {
    try {
        const { role } = req.query; // 'student', 'faculty', or 'all'
        const myUid = req.user.uid;

        let query = db.collection('users');
        if (req.user.role === 'HOD') {
            query = query.where('departmentId', '==', req.user.departmentId).where('role', 'in', ['student', 'faculty']);
        } else if (role && role !== 'all') {
            query = query.where('role', '==', role);
        } else {
            // Admin deleting ALL: Filter out Admins
            query = query.where('role', '!=', 'admin');
        }

        const snapshot = await query.get();
        if (snapshot.empty) return res.json({ message: "No users found to delete." });

        let deletedCount = 0;

        // 1. Delete Auth Users (Parallel but not crashing on fail)
        // We do this first or in parallel.
        const authDeletePromises = snapshot.docs.map(async (doc) => {
            const userData = doc.data();
            if (userData.uid === myUid) return;

            if (userData.uid) {
                try {
                    await admin.auth().deleteUser(userData.uid);
                } catch (e) {
                    console.log(`Failed to delete auth user ${userData.uid}: ${e.message}`);
                }
            }
            deletedCount++;
        });
        await Promise.all(authDeletePromises);

        // 2. Delete Firestore Docs safely
        const docsToDelete = snapshot.docs.filter(doc => doc.data().uid !== myUid);
        await deleteDocsInBatches(docsToDelete);

        // 3. Cleanup separate collections
        // This is tricky without IDs. But if reliable, we should execute massive deletes.
        // For simplicity in this fix, we follow previous logic but safely.
        if (!req.user.departmentId) { // Admin
            if (role === 'faculty' || role === 'all') await deleteCollection(db.collection('faculty'), 400);
            if (role === 'student' || role === 'all') await deleteCollection(db.collection('students'), 400);
        } else {
            // HOD Scope
            const facSnap = await db.collection('faculty').where('departmentId', '==', req.user.departmentId).get();
            await deleteDocsInBatches(facSnap.docs);

            const stuSnap = await db.collection('students').where('departmentId', '==', req.user.departmentId).get();
            await deleteDocsInBatches(stuSnap.docs);
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
        const { departmentId, date } = req.query;

        let query = db.collection('rearrangements');

        if (req.user.role === 'HOD') {
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

        await deleteDocsInBatches(snapshot.docs);

        res.json({ message: `Successfully deleted ${snapshot.size} rearrangement requests.` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

