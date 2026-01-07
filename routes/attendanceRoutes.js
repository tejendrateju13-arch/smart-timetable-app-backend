const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const verifyAdmin = require('../middleware/adminMiddleware');
const Attendance = require('../models/Attendance');
const Rearrangement = require('../models/Rearrangement');
const Notification = require('../models/Notification');
const RearrangementEngine = require('../utils/rearrangementEngine');
const User = require('../models/User'); // For Department ID lookup if needed

// MARK ATTENDANCE
router.post('/', verifyToken, async (req, res) => {
    try {
        const { date, status } = req.body;
        const userId = req.user._id;

        const todayStr = new Date().toISOString().split('T')[0];

        // Check duplicate
        const existing = await Attendance.findOne({ facultyId: userId, date: todayStr });
        if (existing) {
            return res.status(400).json({ message: 'Attendance already marked for today' });
        }

        await Attendance.create({
            facultyId: userId,
            name: req.user.name || req.user.email,
            date: todayStr,
            status: status || 'Present'
        });

        if (status === 'Absent') {
            // Trigger rearrangement (Async)
            // RearrangementEngine.handleAbsence(userId.toString(), todayStr);
        }

        res.status(201).json({ message: 'Attendance marked' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET YOUR HISTORY
router.get('/my-history', verifyToken, async (req, res) => {
    try {
        const history = await Attendance.find({ facultyId: req.user._id }).sort({ date: -1 }).limit(50);
        res.status(200).json(history);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// AVAILABLE SUBSTITUTES
router.get('/available-substitutes', verifyToken, async (req, res) => {
    try {
        const { date, slotId, departmentId } = req.query;
        let targetDeptId = departmentId || req.user.departmentId;

        if (!targetDeptId) {
            return res.status(400).json({ message: "Department ID required" });
        }

        const candidates = await RearrangementEngine.findAvailableSubstitutes(
            targetDeptId, date, slotId, req.user._id.toString()
        );
        res.status(200).json(candidates);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// REQUEST ABSENCE (Specific Period)
router.post('/period-absence', verifyToken, async (req, res) => {
    try {
        const { slotId, date, substituteId, subjectName, className } = req.body;

        const result = await RearrangementEngine.handlePeriodAbsence(
            req.user._id.toString(), date, slotId, substituteId, { subjectName, className }
        );
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET REQUESTS SENT BY ME
router.get('/rearrangement/my-requests', verifyToken, async (req, res) => {
    try {
        const requests = await Rearrangement.find({ requesterId: req.user._id }).sort({ createdAt: -1 });
        res.status(200).json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET REQUESTS SENT TO ME
router.get('/rearrangement/pending-requests', verifyToken, async (req, res) => {
    try {
        const requests = await Rearrangement.find({ substituteId: req.user._id }).sort({ createdAt: -1 });
        res.status(200).json(requests);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET ALL ACCEPTED REARRANGEMENTS (For Main Timetable Overlay)
router.get('/rearrangements', verifyToken, async (req, res) => {
    try {
        const { date, departmentId } = req.query;
        let query = { status: 'accepted' };

        if (date) query.date = date;
        if (departmentId) query.departmentId = departmentId;

        const rearrangements = await Rearrangement.find(query);
        res.status(200).json(rearrangements);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// RESPOND TO REQUEST
router.post('/rearrangement/respond', verifyToken, async (req, res) => {
    try {
        const { requestId, status } = req.body;
        const result = await RearrangementEngine.respondToRequest(requestId, status, req.user._id.toString());
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
