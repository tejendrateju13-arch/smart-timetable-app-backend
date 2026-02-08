const { db } = require('../config/firebase'); // Using Firebase DB directly as reverted
const TimetableSolver = require('../services/engine/solver');
const fs = require('fs');

const generateTimetable = async (req, res) => {
    const { departmentId, year, semester, section, availableFacultyIds } = req.body;
    fs.appendFileSync('debug.log', `[${new Date().toISOString()}] POST /generate - Dept: ${departmentId}, Year: ${year}, Sem: ${semester}\n`);

    try {
        console.log(`Fetching data for generation (Dept: ${departmentId}, Year: ${year}, Sem: ${semester})...`);

        // Fetch ALL lists for robust in-memory processing
        const [deptsSnap, subsSnap, facsSnap, roomsSnap] = await Promise.all([
            db.collection('departments').get(),
            db.collection('subjects').get(),
            db.collection('faculty').get(),
            db.collection('classrooms').get()
        ]);

        const departments = deptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        let allSubjects = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const classrooms = roomsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Data Sanitation: Remove garbage corrupt data that might have crept in as faculty
        let allFaculty = facsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(f => f.name && !f.name.toLowerCase().includes('year'));

        fs.writeFileSync('api_debug.txt', `[DEBUG] Request Dept: ${departmentId}, Year: ${year}, Sem: ${semester}\n`);
        fs.appendFileSync('api_debug.txt', `[DEBUG] Total Subs in DB: ${allSubjects.length}\n`);

        // 1. Filter by Department
        let subjects = allSubjects.filter(s => s.departmentId === departmentId);
        let faculty = allFaculty.filter(f => f.departmentId === departmentId);

        // Fallback for ID mismatches: if nothing found, try name match
        if (subjects.length === 0 && departmentId) {
            const currentDeptObj = departments.find(d => d.id === departmentId);
            if (currentDeptObj) {
                fs.appendFileSync('api_debug.txt', `[WARN] ID match failed, trying name match for ${currentDeptObj.name}\n`);
                subjects = allSubjects.filter(s => s.departmentId === currentDeptObj.name);
                faculty = allFaculty.filter(f => f.departmentId === currentDeptObj.name);
            }
        }

        fs.appendFileSync('api_debug.txt', `[DEBUG] After Dept Filter: Subs: ${subjects.length}, Faculty: ${faculty.length}\n`);

        // 2. Filter Subjects by Year/Sem (Smart Semester Matching)
        if (year) {
            const y = parseInt(year);
            subjects = subjects.filter(s => parseInt(s.year) === y);
        }
        if (semester) {
            const s = parseInt(semester);
            const y = parseInt(year);
            subjects = subjects.filter(sub => {
                const subSem = parseInt(sub.semester);
                if (subSem === s) return true;
                if (y > 0) {
                    const relative = s % 2 === 0 ? 2 : 1;
                    const absolute = (y - 1) * 2 + (s % 2 === 0 ? 2 : 1);
                    return subSem === relative || subSem === absolute;
                }
                return false;
            });
        }

        // 3. Filter Faculty (Availability)
        if (availableFacultyIds && availableFacultyIds.length > 0) {
            faculty = faculty.filter(f => availableFacultyIds.includes(f.id));
        }

        const data = {
            departments,
            subjects,
            faculty,
            classrooms
        };

        fs.appendFileSync('api_debug.txt', `[DEBUG] Final Counts - Subjects: ${subjects.length}, Faculty: ${faculty.length}, Rooms: ${classrooms.length}\n`);

        if (data.subjects.length === 0) {
            const sampleDepts = allSubjects.slice(0, 3).map(s => s.departmentId).join(', ');
            return res.status(400).json({
                message: `No subjects found for Year ${year}, Sem ${semester}. (Total: ${allSubjects.length}, Sample IDs: ${sampleDepts}, Req: ${departmentId})`
            });
        }

        if (data.classrooms.length === 0) {
            return res.status(400).json({ message: 'No classrooms found. Please add classrooms before generating.' });
        }

        console.log('Running Optimization Engine...');
        const candidates = [];

        for (let i = 0; i < 5; i++) {
            // DIVERSITY: Randomize input arrays so the solver makes different greedy choices each time
            const randomizedData = {
                ...data,
                subjects: [...data.subjects].sort(() => Math.random() - 0.5),
                faculty: [...data.faculty].sort(() => Math.random() - 0.5)
            };

            // DEBUG: Log first faculty availability to check structure
            if (i === 0 && randomizedData.faculty.length > 0) {
                const f = randomizedData.faculty[0];
                fs.appendFileSync('api_debug.txt', `[DEBUG] Solver Faculty Check: ${f.name} (ID: ${f.id})\nAvailability: ${JSON.stringify(f.availability)}\nDailyLoad: ${JSON.stringify(f.dailyLoad)}\n`);
            }

            const solver = new TimetableSolver(randomizedData);
            const timetable = solver.solve();

            // CALCULATE SCORE
            let score = 0;
            let labsPlaced = 0;
            let theoryPlaced = 0;

            // Iterate grid to count placements
            Object.values(timetable).forEach(daySlots => {
                Object.values(daySlots).forEach(slot => {
                    if (slot && slot.type === 'Lab') labsPlaced++;
                    if (slot && (slot.type === 'Theory' || slot.type === 'Theory (Extra)')) theoryPlaced++;
                });
            });

            // Weighting: Labs are critical (worth 100 points per slot). Theory worth 10.
            // A Lab has 3 slots, so a full lab is 300 points.
            score = (labsPlaced * 100) + (theoryPlaced * 10);

            candidates.push({
                id: 'proposal_' + Date.now() + '_' + i,
                score: score,
                schedule: timetable,
                conflicts: []
            });
        }

        // Sort by Score Descending
        candidates.sort((a, b) => b.score - a.score);

        // Save result
        const resultRef = db.collection('timetables').doc();
        await resultRef.set({
            departmentId: departmentId || 'ALL',
            year: parseInt(year) || 1,
            semester: parseInt(semester) || 1,
            section: section || 'A',
            createdAt: new Date(),
            active: true, // Mark this as the Active Master Timetable
            subjects: subjects.map(s => ({
                name: s.name,
                code: s.code || '',
                subjectCode: s.code || '', // Explicitly add subjectCode field
                facultyName: s.facultyName || 'TBA',
                facultyId: s.facultyId || null
            })),
            candidates: candidates
        });

        res.status(200).json({
            message: 'Timetable generated successfully',
            jobId: resultRef.id,
            status: 'completed',
            candidates: candidates
        });
    } catch (error) {
        console.error('Error generating timetable:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const getLatestTimetable = async (req, res) => {
    try {
        // Get the most recent timetable
        const snapshot = await db.collection('timetables')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({ message: 'No generated timetable found.' });
        }

        const doc = snapshot.docs[0];
        res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (error) {
        console.error('Error fetching timetable:', error);
        res.status(500).json({ message: 'Error fetching timetable' });
    }
};

module.exports = { generateTimetable, getLatestTimetable };
