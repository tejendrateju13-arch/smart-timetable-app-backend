const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const User = require('../models/User');

// GET /api/students
router.get('/', async (req, res) => {
    try {
        const { departmentId, year, semester, section } = req.query;
        let query = {};

        if (departmentId) query.departmentId = departmentId;
        if (year) query.year = parseInt(year);
        // Smart matching for semester could be implemented, but simple matching for now
        if (semester) query.semester = parseInt(semester);
        if (section) query.section = section;

        const students = await Student.find(query);
        res.status(200).json(students);
    } catch (error) {
        console.error("STUDENT READ FAILED:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// POST /api/students - Add new student
router.post('/', async (req, res) => {
    try {
        const { name, departmentId, year, semester, studentId, email, section } = req.body;

        let uid;
        // 1. Create User Account
        if (email) {
            try {
                let user = await User.findOne({ email });
                if (!user) {
                    user = await User.create({
                        name,
                        email,
                        password: 'student123',
                        role: 'Student',
                        departmentId,
                        studentId
                    });
                }
                uid = user._id;
            } catch (authError) {
                console.error("Auth Create Error (Student):", authError);
                return res.status(400).json({ message: 'Error creating student account: ' + authError.message });
            }
        }

        // 2. Create Student Profile
        const newStudent = await Student.create({
            userId: uid,
            name,
            email: email || '',
            studentId,
            departmentId,
            year: parseInt(year) || 1,
            semester: parseInt(semester) || 1,
            section: section || 'A'
        });

        res.status(201).json(newStudent);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update student
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedStudent = await Student.findByIdAndUpdate(id, req.body, { new: true });
        res.status(200).json(updatedStudent);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete student
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Student.findByIdAndDelete(id);
        res.status(200).json({ message: 'Student deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
