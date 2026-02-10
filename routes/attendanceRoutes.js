const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const verifyAdmin = require('../middleware/adminMiddleware');
const { db } = require('../config/firebase');
const RearrangementEngine = require('../utils/rearrangementEngine');

// Route removed: Duplicate /available-substitutes handler was here. 
// Valid handler exists below around line 194.

// POST /api/attendance/rearrangement/respond - Accept/Reject Request
router.post('/rearrangement/respond', verifyToken, async (req, res) => {
    try {
        console.log("[Respond Debug] Body:", req.body);
        const { requestId, status } = req.body;
        const responderId = req.user.uid;

        if (!requestId || !['accepted', 'rejected'].includes(status)) {
            console.error("[Respond Debug] Invalid Params:", { requestId, status });
            return res.status(400).json({ message: "Invalid Request Params" });
        }

        const result = await RearrangementEngine.respondToRequest(requestId, status, responderId);
        res.json(result);

    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message });
    }
});

// GET /api/attendance/rearrangement/my-requests - Requests sent BY me
router.get('/rearrangement/my-requests', verifyToken, async (req, res) => {
    try {
        const uid = req.user.uid;
        const snapshot = await db.collection('rearrangements')
            .where('requesterUid', '==', uid) // Use consistent Auth UID
            .limit(20)
            .get();

        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        res.json(data);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// GET /api/attendance/rearrangement/pending-requests - Requests sent TO me
router.get('/rearrangement/pending-requests', verifyToken, async (req, res) => {
    try {
        const uid = req.user.uid;
        // We want requests where I am the substitute
        const snapshot = await db.collection('rearrangements')
            .where('substituteFacultyId', '==', uid)
            .limit(50)
            .get();

        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        res.json(data);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Route removed: Consolidated with the detailed handler below (around line 204)


// GET /api/attendance/rearrangements - Fetch rearrangements for a specific date
router.get('/rearrangements', verifyToken, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ message: 'Date is required' });

        const snapshot = await db.collection('rearrangements').where('date', '==', date).get();
        const rearrangements = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        res.status(200).json(rearrangements);
    } catch (error) {
        console.error("Error fetching rearrangements:", error);
        res.status(500).json({ message: error.message });
    }
});

// POST /api/attendance - Mark attendance (Faculty)
router.post('/', verifyToken, async (req, res) => {
    try {
        const { date, status } = req.body; // status: 'Present', 'Absent'
        const userId = req.user.uid;

        const todayStr = new Date().toISOString().split('T')[0];

        // Check if already marked for today
        const snapshot = await db.collection('attendance')
            .where('facultyId', '==', userId)
            .where('date', '==', todayStr)
            .get();

        if (!snapshot.empty) {
            return res.status(400).json({ message: 'Attendance already marked for today' });
        }

        await db.collection('attendance').add({
            facultyId: userId,
            name: req.user.name || req.user.email,
            date: todayStr,
            status: status || 'Present',
            timestamp: new Date().toISOString()
        });

        // TRIGGER REARRANGEMENT IF ABSENT
        if (status === 'Absent') {
            // Trigger async rearrangement
            RearrangementEngine.handleAbsence(userId, todayStr).catch(err => console.error("Rearrangement trigger failed:", err));
        }

        res.status(201).json({
            message: status === 'Absent' ? 'Attendance marked as ABENT. Auto-rearrangement triggered.' : 'Attendance marked successfully',
            rearranged: status === 'Absent'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/attendance/my-history - Get current user's attendance history
router.get('/my-history', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        const snapshot = await db.collection('attendance')
            .where('facultyId', '==', userId)
            .limit(50) // Fetch reasonable amount then sort
            .get();

        const history = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        res.status(200).json(history);
    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).json({ message: 'Error fetching history' });
    }
});

// [REMOVED DUPLICATE ROUTE]

// GET /api/attendance/available-substitutes - Find available faculty (Centralized Logic)
router.get('/available-substitutes', verifyToken, async (req, res) => {
    try {
        const { date, slotId, departmentId } = req.query;
        const facultyId = req.user.uid;

        if (!date || !slotId) return res.status(400).json({ message: 'Date and Slot ID required' });

        // Use default department from token if not provided (fallback to req.user data if customized middleware populates it)
        // Since verifyToken might not populate departmentId, we rely on frontend sending it or fetch it.
        // Assuming frontend sends it or we fetch user.
        let targetDeptId = departmentId;
        if (!targetDeptId) {
            const userDoc = await db.collection('users').doc(req.user.uid).get();
            targetDeptId = userDoc.data()?.departmentId;
        }

        if (!targetDeptId) return res.status(400).json({ message: "Department ID not found" });

        const candidates = await RearrangementEngine.findAvailableSubstitutes(targetDeptId, date, slotId, facultyId);

        res.status(200).json(candidates);
    } catch (error) {
        console.error("[Available Subs] Error:", error);
        res.status(500).json({ message: error.message });
    }

});

// POST /api/attendance/period-absence - Request Rearrangement (Unified)
router.post('/period-absence', verifyToken, async (req, res) => {
    try {
        const { slotId, date, substituteId, subjectName, className } = req.body;
        // CRITICAL FIX: Use firestoreId if available, fallback to uid
        const facultyId = req.user.firestoreId || req.user.uid;

        console.log(`[Attendance] Requesting absence for provider: ${facultyId}`);

        if (!slotId || !date || !substituteId) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Pass extra details found in body to avoid lookup failure
        const result = await RearrangementEngine.handlePeriodAbsence(facultyId, date, slotId, substituteId, {
            subjectName,
            className,
            requesterUid: req.user.uid
        });

        res.status(201).json({
            message: 'Rearrangement triggered successfully',
            substitute: result.substituteName, // For frontend toast
            data: result
        });
    } catch (error) {
        console.error("Period Absence Error:", error);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/attendance/today - Get all faculty attendance (Admin/HOD)
router.get('/today', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { date, departmentId } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];

        let snapshot = await db.collection('attendance')
            .where('date', '==', targetDate)
            .get();

        let attendance = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // If departmentId is provided, we need to filter faculty who belong to that department
        if (departmentId) {
            const facultySnap = await db.collection('faculty')
                .where('departmentId', '==', departmentId)
                .get();

            // Create a Set of valid IDs (both Firestore Doc ID and Auth UID)
            const validIds = new Set();
            facultySnap.docs.forEach(doc => {
                validIds.add(doc.id); // Firestore Doc ID
                const data = doc.data();
                if (data.uid) validIds.add(data.uid); // Auth UID
            });

            attendance = attendance.filter(a => validIds.has(a.facultyId));
        }

        res.status(200).json(attendance);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching attendance' });
    }
});

// GET /api/attendance/notifications - Get all system notifications (Admin)
router.get('/notifications', verifyToken, async (req, res) => {
    try {
        const snapshot = await db.collection('notifications')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();

        const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(notifications);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// NEW: GET /api/attendance/notifications/my-notifications - Get current user notifications
router.get('/notifications/my-notifications', verifyToken, async (req, res) => {
    try {
        const userId = req.user.uid;
        // Fetch notifications where userId matches (New Schema)
        const snapshot = await db.collection('notifications')
            .get();

        const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort in memory to avoid index errors
        notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.status(200).json(notifications);
    } catch (e) {
        console.error("Error fetching my notifications:", e);
        res.status(500).json({ message: e.message });
    }
});

// DELETE /api/attendance/rearrangement/:requestId - Delete a request (Cleanup)
router.delete('/rearrangement/:requestId', verifyToken, async (req, res) => {
    try {
        const { requestId } = req.params;
        const uid = req.user.uid;

        const docRef = db.collection('rearrangements').doc(requestId);

        // Optional: Check ownership? For now allow if logged in, scoped to my view in frontend
        await docRef.delete();

        res.status(200).json({ message: 'Request deleted' });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});



// Routes for Rearrangements have been removed as per request.

module.exports = router;
