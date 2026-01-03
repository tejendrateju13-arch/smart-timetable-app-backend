const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');

// GET /api/config/slots
router.get('/slots', async (req, res) => {
    try {
        const { deptId } = req.query;
        if (!deptId) return res.status(400).json({ message: 'deptId is required' });

        const doc = await db.collection('configs').doc(deptId).get();
        if (!doc.exists) {
            return res.status(200).json({ slots: [] });
        }
        res.status(200).json(doc.data());
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/config/slots
router.post('/slots', async (req, res) => {
    try {
        const { deptId, slots } = req.body;
        if (!deptId) return res.status(400).json({ message: 'deptId is required' });

        await db.collection('configs').doc(deptId).set({ slots, updatedAt: new Date() }, { merge: true });
        res.status(200).json({ message: 'Configuration saved successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
