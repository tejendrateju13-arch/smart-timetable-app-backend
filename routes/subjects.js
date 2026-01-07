const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');
const fs = require('fs');

// GET /api/subjects
router.get('/', async (req, res) => {
    try {
        const { departmentId, year, semester } = req.query;
        let query = {};

        if (departmentId) query.departmentId = departmentId;
        if (year) query.year = parseInt(year);
        if (semester) query.semester = parseInt(semester);

        const subjects = await Subject.find(query);
        res.status(200).json(subjects);
    } catch (error) {
        console.error("GET Subjects Error:", error);
        res.status(500).json({ message: error.message });
    }
});

// POST /api/subjects
router.post('/', async (req, res) => {
    try {
        const { name, code, departmentId, hoursPerWeek, type, year, semester, facultyName, facultyName2 } = req.body;

        const newSubject = await Subject.create({
            name,
            code,
            departmentId,
            year: parseInt(year) || 1,
            semester: parseInt(semester) || 1,
            hoursPerWeek: parseInt(hoursPerWeek) || 3,
            type,
            facultyName,
            facultyName2
        });

        res.status(201).json(newSubject);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update subject
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedSubject = await Subject.findByIdAndUpdate(id, req.body, { new: true });
        res.status(200).json(updatedSubject);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete subject
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Subject.findByIdAndDelete(id);
        res.status(200).json({ message: 'Subject deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
