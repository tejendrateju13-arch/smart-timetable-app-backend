const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');

// Fuzzy Header Mapping Logic
const FIELD_MAPS = {
    faculty: {
        id: ['id', 'faculty id', 'emp id', 'code'],
        name: ['name', 'faculty name', 'teacher', 'professor', 'instructor'],
        departmentId: ['dept', 'department', 'branch'],
        designation: ['designation', 'post', 'role'],
        email: ['email', 'gmail', 'mail'],
        maxClassesPerDay: ['max classes', 'load', 'classes per day']
    },
    students: {
        studentId: ['id', 'roll', 'registration', 'usn'],
        name: ['name', 'student name', 'full name'],
        departmentId: ['dept', 'department', 'branch'],
        year: ['year', 'academic year'],
        semester: ['sem', 'semester'],
        section: ['section', 'sec']
    },
    subjects: {
        code: ['code', 'subject code', 'sub code', 'id'],
        name: ['name', 'subject name', 'title'],
        type: ['type', 'theory/lab', 'category'],
        hoursPerWeek: ['hours', 'weekly hours', 'contact hours'],
        departmentId: ['dept', 'department'],
        semester: ['sem', 'semester']
    },
    classrooms: {
        roomNumber: ['room', 'room no', 'room id', 'number'],
        roomType: ['type', 'room type', 'category'],
        capacity: ['capacity', 'seats', 'size']
    }
};

const mapHeaders = (headers, target) => {
    const map = FIELD_MAPS[target];
    const result = {};
    if (!map) return result;

    headers.forEach(h => {
        const lowerH = h.toLowerCase().trim();
        for (const [field, keywords] of Object.entries(map)) {
            if (keywords.some(k => lowerH.includes(k))) {
                result[h] = field;
                break;
            }
        }
    });
    return result;
};

const uploadFile = async (req, res) => {
    const { target } = req.body; // faculty, students, subjects, classrooms
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    if (!target || !FIELD_MAPS[target]) return res.status(400).json({ message: 'Invalid target type' });

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    try {
        let extractedData = [];

        if (fileExt === '.csv') {
            extractedData = await parseCSV(filePath, target);
        } else if (fileExt === '.xlsx' || fileExt === '.xls') {
            extractedData = await parseExcel(filePath, target);
        } else if (fileExt === '.pdf') {
            extractedData = await parsePDF(filePath, target);
        } else if (fileExt === '.docx') {
            extractedData = await parseDocx(filePath, target);
        } else if (['.jpg', '.jpeg', '.png'].includes(fileExt)) {
            extractedData = await parseImage(filePath, target);
        } else {
            throw new Error('Unsupported file format: ' + fileExt);
        }

        // Cleanup
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        res.status(200).json({
            message: 'File processed successfully',
            target,
            count: extractedData.length,
            data: extractedData
        });

    } catch (error) {
        console.error('Extraction Error:', error);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.status(500).json({ message: 'Error extracting data: ' + error.message });
    }
};

// Parsers
const parseCSV = (filePath, target) => {
    return new Promise((resolve, reject) => {
        const results = [];
        let mapping = {};
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('headers', (headers) => {
                mapping = mapHeaders(headers, target);
            })
            .on('data', (data) => {
                const row = {};
                Object.entries(data).forEach(([h, v]) => {
                    const field = mapping[h];
                    if (field) row[field] = v;
                    else row[h] = v; // Keep original if no mapping, for manual correction
                });
                if (Object.keys(row).length > 0) results.push(row);
            })
            .on('end', () => resolve(results))
            .on('error', reject);
    });
};

const parseExcel = async (filePath, target) => {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = xlsx.utils.sheet_to_json(sheet);
    if (jsonData.length === 0) return [];

    const headers = Object.keys(jsonData[0]);
    const mapping = mapHeaders(headers, target);

    return jsonData.map(row => {
        const mappedRow = {};
        Object.entries(row).forEach(([h, v]) => {
            const field = mapping[h];
            if (field) mappedRow[field] = v;
            else mappedRow[h] = v;
        });
        return mappedRow;
    });
};

const parsePDF = async (filePath, target) => {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    // Simple text split for now, robust table parsing would need more complex logic
    const lines = data.text.split('\n').filter(l => l.trim());
    return lines.map(l => ({ raw: l }));
};

const parseDocx = async (filePath, target) => {
    const result = await mammoth.extractRawText({ path: filePath });
    const lines = result.value.split('\n').filter(l => l.trim());
    return lines.map(l => ({ raw: l }));
};

const parseImage = async (filePath, target) => {
    const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
    const lines = text.split('\n').filter(l => l.trim());
    return lines.map(l => ({ raw: l }));
};

module.exports = { uploadFile };
