const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const { db } = require('../config/firebase');

// GET /api/notifications - Get all notifications for current user
router.get('/', verifyToken, async (req, res) => {
    try {
        const snapshot = await db.collection('notifications')
            .where('userId', '==', req.user.uid)
            .limit(50)
            .get();

        // Sort on server side after fetching
        const notifications = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 20);

        res.status(200).json(notifications);
    } catch (error) {
        console.error('Notification fetch error:', error);
        res.status(200).json([]); // Return empty array instead of error
    }
});

// PUT /api/notifications/:id/read - Mark as read
router.put('/:id/read', verifyToken, async (req, res) => {
    try {
        await db.collection('notifications').doc(req.params.id).update({ read: true });
        res.status(200).json({ message: 'Marked as read' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/notifications - Trigger notification (Internal/Admin use)
router.post('/', verifyToken, async (req, res) => {
    try {
        const { userId, message, type } = req.body;
        await db.collection('notifications').add({
            userId,
            message,
            type: type || 'info',
            read: false,
            createdAt: new Date().toISOString()
        });
        res.status(201).json({ message: 'Notification sent' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
