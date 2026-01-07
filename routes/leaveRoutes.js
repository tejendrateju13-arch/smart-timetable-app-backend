const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const verifyAdmin = require('../middleware/adminMiddleware');
const Leave = require('../models/Leave');
const User = require('../models/User');
const Notification = require('../models/Notification');
// Import service for rearrangement triggering if needed
// const { handleFacultyAbsence } = require('../services/rearrangementService');

// POST /api/leaves - Apply for leave
router.post('/', verifyToken, async (req, res) => {
    try {
        const { startDate, endDate, reason } = req.body;
        const userId = req.user._id;

        const newLeave = await Leave.create({
            facultyId: userId,
            facultyName: req.user.name || req.user.email,
            departmentId: req.user.departmentId || null,
            startDate,
            endDate,
            reason,
            status: 'Pending'
        });

        res.status(201).json({ message: 'Leave application submitted', leave: newLeave });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/leaves - Get all leave requests (Admin/HOD)
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
    try {
        let query = {};

        // HOD Filter Logic
        if (req.user.role === 'HOD') {
            const hodUser = await User.findById(req.user._id);
            if (hodUser && hodUser.departmentId) {
                query.departmentId = hodUser.departmentId;
            }
        }

        const leaves = await Leave.find(query).sort({ appliedAt: -1 });
        res.status(200).json(leaves);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/leaves/my-leaves - Get current user's leaves
router.get('/my-leaves', verifyToken, async (req, res) => {
    try {
        const myLeaves = await Leave.find({ facultyId: req.user._id }).sort({ appliedAt: -1 });
        res.status(200).json(myLeaves);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/leaves/:id/status - Approve/Reject leave
router.put('/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const leave = await Leave.findByIdAndUpdate(req.params.id, { status }, { new: true });

        if (!leave) return res.status(404).json({ message: 'Leave not found' });

        // Notify Faculty
        const notifMessage = status === 'Approved'
            ? `Your leave for ${leave.startDate} to ${leave.endDate} is APPROVED.`
            : `Your leave request for ${leave.startDate} has been REJECTED.`;

        const notifType = status === 'Approved' ? 'success' : 'error';

        const newNotif = await Notification.create({
            recipientId: leave.facultyId,
            title: 'Leave Status Update',
            message: notifMessage,
            type: notifType
        });

        if (req.io) {
            req.io.to(leave.facultyId.toString()).emit('notification', newNotif);
        }

        if (status === 'Approved') {
            // Trigger Auto-Rearrangement Logic Here
            // await handleFacultyAbsence(leave.facultyId, dateStr);
        }

        res.status(200).json({ message: `Leave ${status} successfully` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
