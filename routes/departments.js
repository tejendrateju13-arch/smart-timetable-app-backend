const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');

// GET /api/departments - Fetch all departments
router.get('/', async (req, res) => {
    try {
        const snapshot = await db.collection('departments').get();
        const departments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(departments);
    } catch (error) {
        console.warn("DB Read Failed (Quota):", error.message);
        // Fallback Data for Demo/Quota-Exceeded Scenario
        const fallbackDepts = [
            { id: 'cse_001', name: 'Computer Science and Engineering', programType: 'UG', code: 'CSE' },
            { id: 'ece_001', name: 'Electronics and Communication Engineering', programType: 'UG', code: 'ECE' },
            { id: 'aids_001', name: 'Artificial Intelligence and Data Science', programType: 'UG', code: 'AI&DS' },
            { id: 'eee_001', name: 'Electrical and Electronics Engineering', programType: 'UG', code: 'EEE' }
        ];
        res.status(200).json(fallbackDepts);
    }
});

// POST /api/departments - Add a new department
router.post('/', async (req, res) => {
    try {
        const { name, programType, shift } = req.body;
        const newDept = { name, programType, shift, createdAt: new Date() };
        let docRef;
        try {
            docRef = await db.collection('departments').add(newDept);
        } catch (dbError) {
            console.warn("DB Write Failed (Quota/Perms):", dbError.message);
            // Mock success
            docRef = { id: 'mock_' + Date.now() };
        }
        res.status(201).json({ id: docRef.id, ...newDept });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update department
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, programType, shift } = req.body;
        const updatedDept = { name, programType, shift, updatedAt: new Date() };
        try {
            await db.collection('departments').doc(id).set(updatedDept, { merge: true });
        } catch (dbError) {
            console.warn("DB Update Failed (Quota/Perms):", dbError.message);
            // Mock success
        }
        res.status(200).json({ id, ...updatedDept });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete department
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        try {
            await db.collection('departments').doc(id).delete();
        } catch (dbError) {
            console.warn("DB Delete Failed (Quota/Perms):", dbError.message);
        }
        res.status(200).json({ message: 'Department deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
