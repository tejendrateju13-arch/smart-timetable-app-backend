const express = require('express');
const router = express.Router();
const Classroom = require('../models/Classroom');

// GET /api/classrooms
router.get('/', async (req, res) => {
    try {
        const classrooms = await Classroom.find();
        res.status(200).json(classrooms);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/classrooms
router.post('/', async (req, res) => {
    try {
        const { roomNumber, capacity, roomType } = req.body;
        const newRoom = await Classroom.create({
            roomNumber,
            capacity: parseInt(capacity) || 30,
            roomType
        });
        res.status(201).json(newRoom);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update classroom
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedRoom = await Classroom.findByIdAndUpdate(id, req.body, { new: true });
        res.status(200).json(updatedRoom);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete classroom
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Classroom.findByIdAndDelete(id);
        res.status(200).json({ message: 'Classroom deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
