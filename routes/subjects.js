const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const fs = require('fs');

// GET /api/subjects
router.get('/', async (req, res) => {
    try {
        const { departmentId, year, semester } = req.query;
        const logMsg = `[${new Date().toISOString()}] GET /subjects - Dept: ${departmentId}, Year: ${year}, Sem: ${semester}\n`;
        fs.appendFileSync('debug.log', logMsg);

        let query = db.collection('subjects');

        // Filter by Department ID if provided
        if (departmentId) {
            query = query.where('departmentId', '==', departmentId);
        }

        const snapshot = await query.get();
        let subjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        fs.appendFileSync('debug.log', `[DEBUG] Raw Fetched Count: ${subjects.length}\n`);
        if (subjects.length > 0) {
            fs.appendFileSync('debug.log', `[DEBUG] Sample Subject DeptId: ${subjects[0].departmentId}, Name: ${subjects[0].name}\n`);
        }

        // In-memory filtering for Year and Semester (Robust against type mismatches and missing indexes)
        if (year) {
            const y = parseInt(year);
            subjects = subjects.filter(sub => parseInt(sub.year) === y);
        }

        if (semester) {
            const s = parseInt(semester);
            const y = parseInt(year);

            subjects = subjects.filter(sub => {
                const subSem = parseInt(sub.semester);
                if (subSem === s) return true;

                // Smart matching: If user searches for absolute Sem 6 (Y3S2), also find relative Sem 2 (Y3)
                if (y > 0) {
                    const relative = s % 2 === 0 ? 2 : 1;
                    const absolute = (y - 1) * 2 + (s % 2 === 0 ? 2 : 1);
                    return subSem === relative || subSem === absolute;
                }
                return false;
            });
        }

        res.status(200).json(subjects);
    } catch (error) {
        console.error("GET Subjects Error:", error);
        res.status(500).json({ message: error.message });
    }
});

// POST /api/subjects
router.post('/', async (req, res) => {
    try {
        const { name, shortName, code, departmentId, hoursPerWeek, type, year, semester, facultyName } = req.body;
        const newSubject = {
            name,
            shortName: shortName || '',
            code,
            departmentId,
            year: parseInt(year) || 1,
            semester: parseInt(semester) || 1,
            facultyName: facultyName || '',
            hoursPerWeek: parseInt(hoursPerWeek) || 3,
            type,
            createdAt: new Date()
        };
        const docRef = await db.collection('subjects').add(newSubject);
        res.status(201).json({ id: docRef.id, ...newSubject });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update subject
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };
        delete data.id;
        data.updatedAt = new Date().toISOString();

        await db.collection('subjects').doc(id).set(data, { merge: true });
        res.status(200).json({ id, ...data });
    } catch (error) {
        console.error("Subject Update Error:", error);
        res.status(500).json({ message: error.message });
    }
});

// Delete subject
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('subjects').doc(id).delete();
        res.status(200).json({ message: 'Subject deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
