const { db } = require('./config/firebase');

async function checkSubjects() {
    const deptId = 'CQMKzw3UW8pTVlH1B9kl'; // From debug log
    console.log(`Checking subjects for Dept: ${deptId}`);

    try {
        const snapshot = await db.collection('subjects').where('departmentId', '==', deptId).get();
        if (snapshot.empty) {
            console.log('No subjects found.');
            return;
        }

        console.log(`Found ${snapshot.size} subjects.`);
        snapshot.docs.forEach(doc => {
            const s = doc.data();
            // Check specifically for "Lab" in name or type
            if (s.type === 'Lab' || s.name.toLowerCase().includes('lab')) {
                console.log(`- [LAB] ${s.name} (${s.code}): Type=${s.type}, Year=${s.year}, Sem=${s.semester}, Faculty=${s.facultyName}, Fac2=${s.facultyName2 || 'None'}, ShortName=${s.shortName || 'None'}`);
            } else {
                console.log(`- [THEORY] ${s.name} (${s.code}): Type=${s.type}, Year=${s.year}, Sem=${s.semester}, Faculty=${s.facultyName}`);
            }
        });
    } catch (error) {
        console.error("Error fetching subjects:", error);
    }
}

checkSubjects();
