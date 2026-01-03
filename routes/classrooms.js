const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');

// GET /api/classrooms
router.get('/', async (req, res) => {
    try {
        const snapshot = await db.collection('classrooms').get();
        const classrooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(classrooms);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/classrooms
router.post('/', async (req, res) => {
    try {
        const { roomNumber, capacity, roomType } = req.body;
        const newRoom = {
            roomNumber,
            capacity: parseInt(capacity) || 30,
            roomType,
            createdAt: new Date()
        };
        const docRef = await db.collection('classrooms').add(newRoom);
        res.status(201).json({ id: docRef.id, ...newRoom });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update classroom
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { roomNumber, capacity, roomType } = req.body;
        const updatedRoom = {
            roomNumber,
            capacity: parseInt(capacity) || 30,
            roomType,
            updatedAt: new Date()
        };
        await db.collection('classrooms').doc(id).set(updatedRoom, { merge: true });
        res.status(200).json({ id, ...updatedRoom });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete classroom
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('classrooms').doc(id).delete();
        res.status(200).json({ message: 'Classroom deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
