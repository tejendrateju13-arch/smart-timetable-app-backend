const { db } = require('./config/firebase');
const SchedulerEngine = require('./utils/schedulerEngine');

async function generateTestTimetable() {
    try {
        console.log('--- Generating Test Timetable ---');

        // 1. Get Dept ID (Try both names just in case)
        let deptId;
        const deptSnap = await db.collection('departments').where('name', '==', 'Artificial Intelligence and Data Science').get();
        if (deptSnap.empty) {
            const shortSnap = await db.collection('departments').where('name', '==', 'AI&DS').get();
            if (shortSnap.empty) {
                console.error("Dept not found. Make sure seeding finished.");
                return;
            }
            deptId = shortSnap.docs[0].id;
        } else {
            deptId = deptSnap.docs[0].id;
        }
        console.log(`Dept ID: ${deptId}`);

        // 2. Fetch Data for Year 2 Sem 3
        const year = 2;
        const semester = 3;
        const section = 'A';

        const subjectsSnap = await db.collection('subjects')
            .where('departmentId', '==', deptId)
            .where('year', '==', year)
            .where('semester', '==', semester)
            .get();

        const subjects = subjectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const facultySnap = await db.collection('faculty')
            .where('departmentId', '==', deptId)
            .get();
        const faculty = facultySnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Mock Classrooms
        const classrooms = [
            { id: '101', roomNumber: '205', roomType: 'Lecture' },
            { id: 'Lab1', roomNumber: 'AL Lab', roomType: 'Lab' }
        ];

        console.log(`Found ${subjects.length} subjects, ${faculty.length} faculty.`);

        if (subjects.length === 0) {
            console.error("No subjects found. Seed might have failed or incomplete.");
            return;
        }

        // 3. Generate
        const engine = new SchedulerEngine(subjects, faculty, classrooms);
        const candidates = engine.generateCandidates(1);
        const best = candidates[0];

        // 4. Save
        const timetableId = `tt_${deptId}_Y${year}_S${semester}_Sec${section}`;
        await db.collection('timetables').doc(timetableId).set({
            schedule: best.schedule,
            metaData: {
                departmentId: deptId,
                year,
                semester,
                section,
                score: best.score,
                subjects: subjects.map(s => ({ name: s.name, code: s.code, facultyName: s.facultyName })),
                publishedAt: new Date().toISOString(),
                publishedBy: 'system_auto_gen'
            }
        });

        console.log(`\nSUCCESS: Timetable published to ${timetableId}`);
        console.log("You should now see the timetable in the Faculty Dashboard for verified faculty.");

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

generateTestTimetable();
