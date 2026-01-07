const express = require('express');
const router = express.Router();
const Department = require('../models/Department');

// GET /api/departments - Fetch all departments
router.get('/', async (req, res) => {
    try {
        console.log('[API] Fetching departments...');
        const departments = await Department.find();
        console.log(`[API] Found ${departments.length} departments.`);
        res.status(200).json(departments);
    } catch (error) {
        console.error("DB Read Failed:", error.message);
        res.status(500).json({ message: error.message });
    }
});

// POST /api/departments - Add a new department
router.post('/', async (req, res) => {
    try {
        const { name, programType, shift, code } = req.body;
        // Basic validation or auto-generation for code if missing
        const deptCode = code || name.substring(0, 3).toUpperCase();

        const newDept = await Department.create({
            name,
            code: deptCode,
            // programType and shift are not in the strict schema I created, but Mongoose strict: false by default...
            // Wait, Mongoose default is strict: true.
            // I should update the schema if I want to store these, or strict: false.
            // For now, I'll stick to the model I defined: name, code, hodId.
            // Let's assume the user might want to add these fields to the schema later.
        });

        res.status(201).json(newDept);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update department and sync HOD User role
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { hodId } = req.body;

        // 1. Update Department
        const updatedDept = await Department.findByIdAndUpdate(id, req.body, { new: true });

        // 2. If HOD is assigned/changed, update the Faculty's User record
        if (hodId) {
            const Faculty = require('../models/Faculty');
            const User = require('../models/User');

            const faculty = await Faculty.findById(hodId);
            if (faculty && faculty.userId) {
                // Determine department ID (use the one from params)
                await User.findByIdAndUpdate(faculty.userId, {
                    role: 'HOD',
                    departmentId: id
                });
                console.log(`[API] Promoted User ${faculty.userId} to HOD for Dept ${id}`);
            }
        }

        res.status(200).json(updatedDept);
    } catch (error) {
        console.error("Update Failed:", error);
        res.status(500).json({ message: error.message });
    }
});

// Delete department
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Department.findByIdAndDelete(id);
        res.status(200).json({ message: 'Department deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
