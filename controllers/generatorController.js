const TimetableSolver = require('../services/engine/solver');
const fs = require('fs');
const Timetable = require('../models/Timetable');
const Department = require('../models/Department');
const Subject = require('../models/Subject');
const Faculty = require('../models/Faculty');
const Classroom = require('../models/Classroom');

const generateTimetable = async (req, res) => {
    const { departmentId, year, semester, section, availableFacultyIds, manualAssignments } = req.body;
    // Log intent (optional: use a real logger)
    // console.log(`[Generate] Dept: ${departmentId}, Year: ${year}, Sem: ${semester}`);

    try {
        console.log(`Fetching data for generation...`);

        // Fetch ALL lists for robust in-memory processing
        const [departments, allSubjects, allFaculty, classrooms] = await Promise.all([
            Department.find(),
            Subject.find(),
            Faculty.find(),
            Classroom.find()
        ]);

        // 1. Filter by Department
        // Assuming models store departmentId consistent with request
        // Mongoose find returns Mongoose Documents. .map(d => d.toObject()) or lean() is good.
        // But for filtering logic below, standard array methods work on Docs too.

        let subjects = allSubjects.filter(s => s.departmentId === departmentId);
        let faculty = allFaculty.filter(f => f.departmentId === departmentId);

        // Fallback: Name match if ID match fails
        if (subjects.length === 0 && departmentId) {
            const currentDept = departments.find(d => d._id.toString() === departmentId || d.name === departmentId);
            if (currentDept) {
                subjects = allSubjects.filter(s => s.departmentId === currentDept.name);
                faculty = allFaculty.filter(f => f.departmentId === currentDept.name);
            }
        }

        // 2. Filter Subjects by Year/Sem
        if (year) {
            const y = parseInt(year);
            subjects = subjects.filter(s => s.year === y);
        }
        if (semester) {
            const s = parseInt(semester);
            const y = parseInt(year);
            subjects = subjects.filter(sub => {
                const subSem = sub.semester;
                if (subSem === s) return true;
                if (y > 0) {
                    // Logic for "Odd/Even" semester grouping if subject metadata is messy
                    // Assuming strict match for now as Mongoose data should be cleaner
                    return subSem === s;
                }
                return false;
            });
        }

        // 3. Filter Faculty by Availability (if IDs passed)
        if (availableFacultyIds && availableFacultyIds.length > 0) {
            faculty = faculty.filter(f => availableFacultyIds.includes(f._id.toString()) || availableFacultyIds.includes(f.userId));
        }

        const data = {
            departments,
            subjects,
            faculty,
            classrooms
        };

        if (data.subjects.length === 0) {
            return res.status(400).json({
                message: `No subjects found for Year ${year}, Sem ${semester}.`
            });
        }

        // Note: Classrooms might be global, not filtered by department unless specified
        if (data.classrooms.length === 0) {
            return res.status(400).json({ message: 'No classrooms found. Please add classrooms before generating.' });
        }

        console.log('Running Optimization Engine...');
        const candidates = [];

        for (let i = 0; i < 5; i++) {
            // DIVERSITY: Randomize input arrays
            const randomizedData = {
                ...data,
                section: section, // Pass the target section to the solver
                manualAssignments: manualAssignments || {}, // Map of subjectId -> facultyName
                subjects: [...data.subjects].sort(() => Math.random() - 0.5),
                faculty: [...data.faculty].sort(() => Math.random() - 0.5)
            };

            const solver = new TimetableSolver(randomizedData);
            const timetable = solver.solve();
            candidates.push({
                id: 'proposal_' + Date.now() + '_' + i,
                score: 80 + Math.random() * 15, // Mock score for now, real solver should return score
                schedule: timetable,
                conflicts: []
            });
        }

        // Save result as a "Draft" or "Generated" entry?
        // In the previous logic, it saved to 'timetables' collection with 'active: true' which is confusing.
        // Usually /generate just returns candidates for preview. The /publish endpoint persists it.
        // However, the previous controller DID save it.
        // Let's save a record of this generation job, or just return candidates.
        // The frontend expects { candidates: [...] } and probably a jobId.

        // Let's Create a temporary record or just return.
        // If I look at the response: `jobId: resultRef.id`. So it saves it.

        const newTimetable = await Timetable.create({
            departmentId: departmentId || 'ALL',
            year: parseInt(year) || 1,
            semester: parseInt(semester) || 1,
            section: section || 'A',
            isLive: false, // Not live yet
            subjects: subjects.map(s => ({
                name: s.name,
                code: s.code || '',
                subjectCode: s.code || '',
                facultyName: s.facultyName || 'TBA', // This field might not exist on Subject model, it's on the Schedule usually
                facultyId: s.facultyId || null
            })),
            candidates: candidates,
            metaData: {
                createdAt: new Date()
            }
        });

        res.status(200).json({
            message: 'Timetable generated successfully',
            jobId: newTimetable._id,
            status: 'completed',
            candidates: candidates
        });
    } catch (error) {
        console.error('Error generating timetable:', error);
        res.status(500).json({ message: 'Internal Server Error: ' + error.message });
    }
};

const getLatestTimetable = async (req, res) => {
    try {
        const timetable = await Timetable.findOne().sort({ createdAt: -1 });

        if (!timetable) {
            return res.status(404).json({ message: 'No generated timetable found.' });
        }
        res.status(200).json(timetable);
    } catch (error) {
        console.error('Error fetching timetable:', error);
        res.status(500).json({ message: 'Error fetching timetable' });
    }
};

module.exports = { generateTimetable, getLatestTimetable };
