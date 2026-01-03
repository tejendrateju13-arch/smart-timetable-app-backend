const express = require('express');
const router = express.Router();
const multer = require('multer');
const { db, admin } = require('../config/firebase');
const verifyToken = require('../middleware/authMiddleware');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const parseNum = (val) => {
    if (val === undefined || val === null || val === '') return 1;
    if (typeof val === 'number') return val;
    const match = val.toString().match(/\d+/);
    return match ? parseInt(match[0]) : 1;
};

// Helper function to detect data type based on headers/content
const detectDataType = (data) => {
    if (!data || data.length === 0) return 'unknown';

    const firstRow = data[0];
    const headers = Object.keys(firstRow).map(h => h.toLowerCase());

    // Check for student indicators
    if (headers.some(h => h.includes('student') || h.includes('roll') || h.includes('regno'))) {
        return 'students';
    }

    // Check for faculty indicators
    if (headers.some(h => h.includes('faculty') || h.includes('professor') || h.includes('instructor'))) {
        return 'faculty';
    }

    // Check for subject indicators
    if (headers.some(h => h.includes('subject') || h.includes('course') || h.includes('code'))) {
        return 'subjects';
    }

    return 'unknown';
};

// Helper to parse CSV
const parseCSV = (buffer) => {
    const text = buffer.toString('utf-8');
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, idx) => {
            row[header] = values[idx] || '';
        });
        data.push(row);
    }

    return data;
};

// Helper to parse Excel
const parseExcel = async (buffer) => {
    try {
        const XLSX = require('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_json(sheet);
    } catch (err) {
        console.error('Excel parse error:', err);
        return [];
    }
};

// POST /api/upload/extract - Extract data from file
router.post('/extract', verifyToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const fileExt = req.file.originalname.split('.').pop().toLowerCase();
        let extractedData = [];

        // Parse based on file type
        if (fileExt === 'csv') {
            extractedData = parseCSV(req.file.buffer);
        } else if (fileExt === 'xlsx' || fileExt === 'xls') {
            extractedData = await parseExcel(req.file.buffer);
        } else if (fileExt === 'pdf') {
            const data = await pdf(req.file.buffer);
            extractedData = data.text.split('\n').filter(l => l.trim()).map(l => ({ raw: l }));
        } else if (fileExt === 'docx') {
            const result = await mammoth.extractRawText({ buffer: req.file.buffer });
            extractedData = result.value.split('\n').filter(l => l.trim()).map(l => ({ raw: l }));
        } else if (['jpg', 'jpeg', 'png'].includes(fileExt)) {
            const { data: { text } } = await Tesseract.recognize(req.file.buffer, 'eng');
            extractedData = text.split('\n').filter(l => l.trim()).map(l => ({ raw: l }));
        } else {
            return res.status(400).json({ message: 'Unsupported file format. Please use CSV, Excel, PDF, or DOCX.' });
        }

        if (extractedData.length === 0) {
            return res.status(400).json({ message: 'No data found in file' });
        }

        // Auto-detect data type if not explicitly provided
        const dataType = req.body.target || detectDataType(extractedData);

        console.log('📤 EXTRACTION RESULT:', {
            fileType: fileExt,
            dataType,
            count: extractedData.length,
            sample: extractedData.slice(0, 3)
        });

        res.status(200).json({
            data: extractedData,
            type: dataType,
            count: extractedData.length
        });
    } catch (error) {
        console.error('Extract error:', error);
        res.status(500).json({ message: 'Failed to extract data: ' + error.message });
    }
});

// POST /api/upload/import - Import extracted data to database
router.post('/import', verifyToken, async (req, res) => {
    try {
        const { data, type } = req.body;
        let { departmentId } = req.body;

        if (!data || !type || data.length === 0) {
            return res.status(400).json({ message: 'Invalid data' });
        }

        // Robust default department fallthrough
        if (!departmentId) {
            const deptSnap = await db.collection('departments').get();
            const aidsDept = deptSnap.docs.find(d =>
                d.data().name.includes('AI&DS') ||
                d.data().name.toLowerCase().includes('artificial intelligence')
            );
            if (aidsDept) departmentId = aidsDept.id;
            else departmentId = 'aids_001'; // last resort hardcoded ID matching seeding logic
        }

        let imported = 0;
        const batch = db.batch();

        // Shared helper for case-insensitive and fuzzy key matching
        const getVal = (row, aliases) => {
            const rowKeys = Object.keys(row);
            const lowAliases = aliases.map(a => a.toLowerCase().trim());

            // 1. Exact case-insensitive match
            const key = rowKeys.find(k => lowAliases.includes(k.toLowerCase().trim()));
            if (key) return row[key];

            // 2. Fuzzy match (contains)
            const fuzzyKey = rowKeys.find(k => {
                const lowK = k.toLowerCase().trim();
                return lowAliases.some(a => lowK.includes(a) || a.includes(lowK));
            });
            return fuzzyKey ? row[fuzzyKey] : '';
        };

        if (type === 'students') {
            for (const row of data) {
                const docRef = db.collection('students').doc();
                const rawName = row.raw || getVal(row, ['name', 'student name', 'full name', 'studentname']);
                const name = (rawName && typeof rawName === 'string' && rawName.trim()) ? rawName.trim() : 'Extracted Student ' + Math.floor(Math.random() * 1000);
                const roll = getVal(row, ['id', 'studentid', 'roll no', 'reg no', 'rollnumber', 'rollno']) || 'S' + Date.now().toString().slice(-6);
                const email = getVal(row, ['email', 'email address', 'mail']) || (roll.toLowerCase() + '@college.edu');

                // Try to create Auth User
                let uid = '';
                try {
                    const userRecord = await admin.auth().createUser({
                        email,
                        password: 'student123',
                        displayName: name
                    });
                    uid = userRecord.uid;
                    // Create in users collection
                    await db.collection('users').doc(uid).set({
                        email,
                        name,
                        role: 'Student',
                        departmentId,
                        studentId: roll,
                        createdAt: new Date().toISOString()
                    });
                } catch (e) {
                    if (e.code === 'auth/email-already-exists') {
                        const existing = await admin.auth().getUserByEmail(email);
                        uid = existing.uid;
                    }
                }

                batch.set(docRef, {
                    name,
                    studentId: roll,
                    email,
                    uid,
                    departmentId: departmentId || getVal(row, ['dept', 'department', 'departmentid']) || 'aids_001',
                    year: parseNum(getVal(row, ['year', 'yr'])),
                    semester: parseNum(getVal(row, ['semester', 'sem'])),
                    section: getVal(row, ['section', 'sec']) || 'A',
                    createdAt: new Date().toISOString()
                });
                imported++;
            }
        } else if (type === 'faculty') {
            for (const row of data) {
                const docRef = db.collection('faculty').doc();
                let rawName = row.raw || getVal(row, ['name', 'faculty name', 'professor', 'instructor', 'facultyname']);

                if (rawName && typeof rawName === 'string') {
                    rawName = rawName.trim();
                    rawName = rawName.replace(/^(MRS?\.|MS\.|DR\.|PROF\.|PROFESSOR)\s*/i, '');
                }

                const name = (rawName && rawName.length > 0) ? rawName : 'Extracted Faculty ' + Math.floor(Math.random() * 1000);

                let email = getVal(row, ['email', 'email address', 'mail']);
                if (!email && name && !name.startsWith('Extracted Faculty')) {
                    const nameParts = name.split(/\s+/).filter(p => p.length > 0);
                    const lastName = nameParts[nameParts.length - 1].toLowerCase();
                    email = `${lastName}.ai@gmail.com`;
                } else if (!email) {
                    email = name.toLowerCase().replace(/\s+/g, '.') + '@college.edu';
                }

                // Try to create Auth User
                let uid = '';
                try {
                    const userRecord = await admin.auth().createUser({
                        email,
                        password: 'faculty123',
                        displayName: name
                    });
                    uid = userRecord.uid;
                    // Create in users collection
                    await db.collection('users').doc(uid).set({
                        email,
                        name,
                        role: 'Faculty',
                        departmentId,
                        createdAt: new Date().toISOString()
                    });
                } catch (e) {
                    if (e.code === 'auth/email-already-exists') {
                        const existing = await admin.auth().getUserByEmail(email);
                        uid = existing.uid;
                    }
                }

                batch.set(docRef, {
                    name,
                    email,
                    uid,
                    departmentId: departmentId || getVal(row, ['dept', 'department', 'departmentid']) || 'aids_001',
                    designation: getVal(row, ['designation', 'role', 'title']) || 'Faculty',
                    years: [1, 2, 3, 4],
                    sections: ['A', 'B', 'C'],
                    maxClassesPerDay: 2,
                    createdAt: new Date().toISOString()
                });
                imported++;
            }
        }
        else if (type === 'subjects') {
            for (const row of data) {
                const docRef = db.collection('subjects').doc();
                const rawName = row.raw || getVal(row, ['name', 'subject', 'subject name', 'course', 'subjectname']);
                const name = (rawName && typeof rawName === 'string' && rawName.trim()) ? rawName.trim() : 'Extracted Subject ' + Math.floor(Math.random() * 1000);

                let code = getVal(row, ['code', 'subject code', 'course code', 'subjectcode']);
                if (!code && name && !name.startsWith('Extracted Subject')) {
                    const codeMatch = name.match(/^([A-Z]{2,4}\d{3})/i);
                    if (codeMatch) {
                        code = codeMatch[1].toUpperCase();
                    } else {
                        const words = name.split(/\s+/).filter(w => w.length > 0);
                        if (words.length >= 2) {
                            code = words.slice(0, 2).map(w => w[0].toUpperCase()).join('') + Math.floor(Math.random() * 100);
                        } else {
                            code = 'SUB' + Math.floor(Math.random() * 1000);
                        }
                    }
                }

                batch.set(docRef, {
                    name,
                    code: code || 'SUB' + Math.floor(Math.random() * 1000),
                    departmentId: departmentId || getVal(row, ['dept', 'department', 'departmentid']) || 'aids_001',
                    year: parseNum(getVal(row, ['year', 'yr'])),
                    semester: parseNum(getVal(row, ['semester', 'sem'])),
                    type: getVal(row, ['type', 'theory/lab']) || 'Theory',
                    hoursPerWeek: 6,
                    createdAt: new Date().toISOString()
                });
                imported++;
            }
        } else if (type === 'classrooms') {
            for (const row of data) {
                const docRef = db.collection('classrooms').doc();
                batch.set(docRef, {
                    roomNumber: String(getVal(row, ['room', 'roomnumber', 'number', 'id', 'roomno']) || 'R' + Math.floor(Math.random() * 500)),
                    roomType: getVal(row, ['type', 'kind']) || 'Classroom',
                    capacity: parseInt(getVal(row, ['capacity', 'size', 'seats']) || 60),
                    createdAt: new Date().toISOString()
                });
                imported++;
            }
        }

        await batch.commit();

        res.status(200).json({
            message: `Successfully imported ${imported} ${type}`,
            count: imported
        });
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ message: 'Failed to import data: ' + error.message });
    }
});

module.exports = router;
