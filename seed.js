const { admin, db } = require('./config/firebase');

if (!admin.apps.length) {
    console.error("Firebase not initialized. Check configuration.");
    process.exit(1);
}

const seedData = async () => {
    try {
        console.log('--- STARTING ARCHITECTURE SEED (SECTIONS & ROLES) ---');

        // 1. Departments
        const deptRef = db.collection('departments');
        const getDeptId = async (name) => {
            const snap = await deptRef.where('name', '==', name).get();
            if (snap.empty) {
                const res = await deptRef.add({ name, programType: 'UG', createdAt: new Date() });
                console.log(`Created Dept: ${name}`);
                return res.id;
            }
            return snap.docs[0].id;
        };


        const aidsId = await getDeptId('AI&DS');

        console.log('Departments checked/created.');

        // 2. User Accounts with Roles
        const usersRef = db.collection('users');
        const createAccount = async (email, password, name, role, deptId = null) => {
            try {
                let uid;
                try {
                    const userRecord = await admin.auth().getUserByEmail(email);
                    uid = userRecord.uid;
                } catch (e) {
                    const newUser = await admin.auth().createUser({ email, password, displayName: name });
                    uid = newUser.uid;
                }
                await usersRef.doc(uid).set({
                    uid, email, name, role, departmentId: deptId, createdAt: new Date()
                }, { merge: true });
                console.log(`[USER] ${role} for ${name} (${email})`);
                return uid;
            } catch (err) { console.error(`Failed to create account ${email}:`, err.message); }
        };

        // Admins
        await createAccount('admin@sreerama.edu', 'sreerama123', 'System Administrator', 'Admin');

        // HODs
        await createAccount('hod.aids@sreerama.edu', 'hod123', 'Dr. Swapna Sudha (HOD AI&DS)', 'HOD', aidsId);

        // Faculty
        // Faculty - Managed in Dept Loop below to ensure subject assignment
        // await createAccount('prof.cse1.college@gmail.com', 'faculty123', 'Prof. Satish (CSE)', 'Faculty', cseId);
        // await createAccount('prof.aids1.college@gmail.com', 'faculty123', 'Prof. Lakshmi (AI&DS)', 'Faculty', aidsId);

        // Students (Sample - Fixed for Easy Testing)
        await createAccount('student1@sreerama.edu', 'student123', 'Test Student 1 (AI&DS)', 'Student', aidsId);
        await createAccount('student2@sreerama.edu', 'student123', 'Test Student 2 (AI&DS)', 'Student', aidsId);
        await createAccount('student3@sreerama.edu', 'student123', 'Test Student 3 (AI&DS)', 'Student', aidsId);
        console.log('User accounts checked/created.');

        // 3. Subjects & Sections Overhaul
        const subRef = db.collection('subjects');
        const facultyRef = db.collection('faculty');
        const studentRef = db.collection('students');
        const roomRef = db.collection('classrooms');
        // usersRef, deptRef are defined above

        console.log('--- WIPE MODE: Deleting ALL Layout Data ---');
        const clearCol = async (col) => {
            const snap = await col.get();
            if (snap.empty) return;
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`Cleared collection.`);
        };

        // Clearing order matters slightly for references but for NoSQL it's loose.
        await clearCol(subRef);
        await clearCol(studentRef);
        await clearCol(facultyRef);
        await clearCol(usersRef);
        await clearCol(deptRef);
        await clearCol(roomRef);
        console.log('All collections wiped. Starting fresh.');

        // Re-define getDeptId logic as it was clearing departments above
        const getDeptId2 = async (name) => {
            const res = await deptRef.add({ name, programType: 'UG', createdAt: new Date() });
            console.log(`Created Dept: ${name}`);
            return res.id;
        };

        const aidsId2 = await getDeptId2('AI&DS');


        // Update the depts array IDs because we just recreated them!
        const depts = [
            { id: aidsId2, name: 'Artificial Intelligence and Data Science', prefix: 'AI' },
        ];

        const addFacultyMeta = async (name, deptId) => {
            const snap = await facultyRef.where('name', '==', name).get();
            if (snap.empty) {
                await facultyRef.add({ name, departmentId: deptId, maxClassesPerDay: 4 });
            }
        };
        const sections = ['A', 'B', 'C']; // 60 students per section = 180 per branch

        // 3. Clear existing
        console.log('Clearing old subjects/students/faculty for fresh large-scale seed...');
        await clearCol(subRef);
        await clearCol(studentRef);
        await clearCol(facultyRef);

        const realFacultyNames = [

        ];

        const theorySubjects = [

        ];

        const labSubjects = [

        ];

        console.log('--- SEEDING COMPLETE ---');
        process.exit(0);
    } catch (err) {
        console.error('Seeding crashed:', err);
        process.exit(1);
    }
};

seedData();
