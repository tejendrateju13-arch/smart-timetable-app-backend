const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const verifyAdmin = require('../middleware/adminMiddleware');
const { db } = require('../config/firebase');
const { handleFacultyAbsence } = require('../services/rearrangementService');

// POST /api/leaves - Apply for leave
router.post('/', verifyToken, async (req, res) => {
    try {
        const { startDate, endDate, reason } = req.body;
        const userId = req.user.uid;

        // Fetch user details to get departmentId
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();

        await db.collection('leaves').add({
            facultyId: userId,
            facultyName: userData.name || req.user.email,
            departmentId: userData.departmentId || null, // Store dept for filtering
            startDate,
            endDate,
            reason,
            status: 'Pending',
            appliedAt: new Date().toISOString()
        });

        // Trigger Notification for Admins (Simple Logic: Add to general notification or broadcast)
        // For now, just save.

        res.status(201).json({ message: 'Leave application submitted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
});

// GET /api/leaves - Get all leave requests (Admin/HOD)
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
    try {
        let query = db.collection('leaves').orderBy('appliedAt', 'desc');

        // If HOD, filter by their department
        if (req.user.role === 'HOD') {
            // We need to fetch the HOD's department ID from their user profile if not in token
            // AdminMiddleware might attach it, or we fetch it.
            // Let's assume we fetch it or it's attached.
            // Since adminMiddleware checks DB for role, it doesn't attach the full doc by default unless we modify it.
            // Let's just fetch the user doc again here to be safe and get departmentId.
            const userDoc = await db.collection('users').doc(req.user.uid).get();
            const userData = userDoc.exists ? userDoc.data() : {};
            if (userData.departmentId) {
                // We need to filter leaves by faculty who belong to this department.
                // The 'leaves' collection currently stores 'facultyId' and 'facultyName'.
                // It DOES NOT store 'departmentId' on the leave document.
                // FIX: We should ideally store departmentId on leave creation. 
                // BACKFILL Strategy: For now, we might have to filter in memory or fetch all leaves and filter.
                // BETTER: Update POST / to save departmentId.
            }
        }

        // Wait, efficient query needs departmentId on the leave doc.
        // I will first update the POST route to save departmentId.
        // Then I can query by it.

        // Let's fetch the leaves first.
        const snapshot = await query.get();
        let leaves = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // HOD Filter Logic
        if (req.user.role === 'HOD') {
            const userDoc = await db.collection('users').doc(req.user.uid).get();
            // SAFE ACCESS: Check if doc exists and data is valid
            const userData = userDoc.exists ? userDoc.data() : {};
            const hodDeptId = userData.departmentId;

            if (hodDeptId) {
                // Filter by Department ID
                leaves = leaves.filter(l => l.departmentId === hodDeptId);
            }
        }

        res.status(200).json(leaves);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching leaves' });
    }
});

// GET /api/leaves/my-leaves - Get current user's leaves
router.get('/my-leaves', verifyToken, async (req, res) => {
    try {
        const snapshot = await db.collection('leaves')
            .where('facultyId', '==', req.user.uid)
            .get();

        const myLeaves = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
        res.status(200).json(myLeaves);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching your leaves' });
    }
});

// PUT /api/leaves/:id/status - Approve/Reject leave (Admin)
router.put('/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status } = req.body; // 'Approved', 'Rejected'
        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const leaveDoc = await db.collection('leaves').doc(req.params.id).get();
        if (!leaveDoc.exists) return res.status(404).json({ message: 'Leave not found' });

        const leaveData = leaveDoc.data();

        await db.collection('leaves').doc(req.params.id).update({ status });

        if (status === 'Approved') {
            // TRIGGER AUTO-REARRANGEMENT (Loop through date range)
            const start = new Date(leaveData.startDate);
            const end = new Date(leaveData.endDate);

            // Loop from start to end
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                // Adjust for timezone if needed, or just use string
                // Ideally use a utility to format YYYY-MM-DD
                const dateStr = d.toISOString().split('T')[0];
                console.log(`[Leave] Triggering rearrangement for ${dateStr}`);

                await handleFacultyAbsence(leaveData.facultyId, dateStr);
            }

            // Also message:
            await db.collection('notifications').add({
                recipientId: leaveData.facultyId, // UID
                message: `Your leave for ${leaveData.startDate} to ${leaveData.endDate} is APPROVED. Classes have been rearranged.`,
                type: 'success',
                read: false,
                timestamp: new Date().toISOString()
            });
        } else {
            await db.collection('notifications').add({
                recipientId: leaveData.facultyId, // UID
                message: `Your leave request for ${leaveData.startDate} has been ${status}.`,
                type: 'error',
                read: false,
                timestamp: new Date().toISOString()
            });
        }

        res.status(200).json({ message: `Leave ${status} successfully. Rearrangement triggered if approved.` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error updating status' });
    }
});

module.exports = router;
