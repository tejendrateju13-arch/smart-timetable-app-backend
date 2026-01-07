const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty');
const User = require('../models/User');
const verifyToken = require('../middleware/authMiddleware');

// GET /my-availability
router.get('/my-availability', verifyToken, async (req, res) => {
    try {
        const email = req.user.email;
        const faculty = await Faculty.findOne({ email });

        if (!faculty) {
            return res.status(404).json({ message: "Faculty profile not found" });
        }

        res.status(200).json(faculty);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /my-availability
router.put('/my-availability', verifyToken, async (req, res) => {
    try {
        const email = req.user.email;
        if (!req.body.availability) {
            return res.status(400).json({ message: "Availability data is required" });
        }

        // Mongoose strict mode might strip 'availability' if not in schema.
        // Assuming I need to add 'availability' to Faculty schema or use strict: false.
        // For now, I will add it to the schema in a separate step or assume I can update it.
        // Actually, let's update the Faculty Model to include availability.

        const faculty = await Faculty.findOneAndUpdate(
            { email },
            { $set: { availability: req.body.availability } }, // This might fail if schema doesn't have it.
            { new: true, strict: false }
        );

        if (!faculty) {
            return res.status(404).json({ message: "Faculty profile not found" });
        }

        res.status(200).json({ message: "Availability updated", faculty });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/faculty
router.get('/', async (req, res) => {
    try {
        const { departmentId, year, section } = req.query;
        let query = {};

        if (departmentId) query.departmentId = departmentId;
        if (year) query.years = parseInt(year);
        if (section) query.sections = section;

        const faculty = await Faculty.find(query);
        res.status(200).json(faculty);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/faculty - Add new faculty
router.post('/', async (req, res) => {
    try {
        const { name, departmentId, maxClassesPerDay, email, years, sections } = req.body;

        // 1. Create User Account (for Login)
        // Check if user exists
        let user = await User.findOne({ email });
        let uid;

        if (!user) {
            try {
                user = await User.create({
                    name,
                    email,
                    password: 'faculty123', // Default Password
                    role: 'Faculty',
                    departmentId
                });
                uid = user._id; // Store MongoDB ID as uid for reference if needed
            } catch (err) {
                return res.status(400).json({ message: 'Error creating user account: ' + err.message });
            }
        } else {
            uid = user._id;
        }

        // 2. Create Faculty Profile
        const newFaculty = await Faculty.create({
            userId: uid,
            name,
            email,
            departmentId,
            maxClassesPerDay: parseInt(maxClassesPerDay) || 4,
            years: years || [],
            sections: sections || []
        });

        res.status(201).json(newFaculty);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update faculty
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedFaculty = await Faculty.findByIdAndUpdate(id, req.body, { new: true });
        res.status(200).json(updatedFaculty);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete faculty
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Faculty.findByIdAndDelete(id);
        res.status(200).json({ message: 'Faculty member deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
