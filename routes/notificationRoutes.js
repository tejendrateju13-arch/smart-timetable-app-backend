const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');

// GET /api/notifications - Get all notifications for current user
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch notifications where recipientId matches userId OR 'ALL'
        // Assuming we want to support global notifications
        const notifications = await Notification.find({
            $or: [{ recipientId: userId }, { recipientId: 'ALL' }]
        })
            .sort({ createdAt: -1 })
            .limit(20);

        res.status(200).json(notifications);
    } catch (error) {
        console.error('Notification fetch error:', error);
        res.status(200).json([]); // Return empty array instead of error
    }
});

// PUT /api/notifications/:id/read - Mark as read
router.put('/:id/read', verifyToken, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.status(200).json({ message: 'Marked as read' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/notifications - Trigger notification (Internal/Admin use)
router.post('/', verifyToken, async (req, res) => {
    try {
        const { userId, message, type, title } = req.body;

        const newNotif = await Notification.create({
            recipientId: userId,
            title: title || 'System Notification',
            message,
            type: type || 'info'
        });

        // Real-time emission via Socket.io
        if (req.io) {
            req.io.to(userId).emit('notification', newNotif);
        }

        res.status(201).json({ message: 'Notification sent' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
