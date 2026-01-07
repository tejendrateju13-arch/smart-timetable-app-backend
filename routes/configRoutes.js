const express = require('express');
const router = express.Router();
const Config = require('../models/Config');

// GET /api/config/slots
router.get('/slots', async (req, res) => {
    try {
        const { deptId } = req.query;
        if (!deptId) return res.status(400).json({ message: 'deptId is required' });

        const config = await Config.findOne({ deptId });
        if (!config) {
            return res.status(200).json({ slots: [] });
        }
        res.status(200).json(config);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/config/slots
router.post('/slots', async (req, res) => {
    try {
        const { deptId, slots } = req.body;
        if (!deptId) return res.status(400).json({ message: 'deptId is required' });

        await Config.findOneAndUpdate({ deptId }, { slots }, { upsert: true, new: true });
        res.status(200).json({ message: 'Configuration saved successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
