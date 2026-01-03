const { db } = require('./config/firebase');

async function debugMatch() {
    try {
        console.log('Fetching Departments...');
        const deptSnap = await db.collection('departments').where('name', '==', 'Artificial Intelligence and Data Science').get();

        let deptId;
        if (deptSnap.empty) {
            console.log("Dept 'Artificial Intelligence and Data Science' not found. Trying 'AI&DS'...");
            const deptSnap2 = await db.collection('departments').where('name', '==', 'AI&DS').get();
            if (deptSnap2.empty) {
                console.log("Dept 'AI&DS' not found either.");
                return;
            }
            deptId = deptSnap2.docs[0].id;
        } else {
            deptId = deptSnap.docs[0].id;
        }
        console.log(`Using Dept ID: ${deptId}`);

        // Name to test (try exact seed name first)
        const testName1 = "Prof. Lakshmi (AI&DS)"; // From seed.js
        const testName2 = "Dr. S. Lakshmi (Artificial Intelligence and Data Science)"; // From what I suspected

        console.log(`\n--- Testing Match for: '${testName1}' ---`);
        await runQuery(deptId, testName1);

        console.log(`\n--- Testing Match for: '${testName2}' ---`);
        await runQuery(deptId, testName2);

    } catch (error) {
        console.error('Error:', error);
    }
}

async function runQuery(departmentId, facultyName) {
    const snapshot = await db.collection('timetables')
        .where('metaData.departmentId', '==', departmentId)
        .get();

    if (snapshot.empty) {
        console.log('No timetables found for this Dept ID.');
        return;
    }

    let found = false;
    let checkedSlots = 0;

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        const schedule = data.schedule;

        Object.keys(schedule).forEach(day => {
            const daySlots = schedule[day];
            const keys = Object.keys(daySlots);

            keys.forEach((key, index) => {
                const slot = daySlots[key];
                if (slot) {
                    checkedSlots++;
                    // Print first 3 distinct names to see format
                    if (checkedSlots <= 5) {
                        console.log(`   Slot Faculty: '${slot.facultyName}' (ID: ${slot.facultyId || 'N/A'})`);
                    }

                    if ((slot.faculty === facultyName || slot.facultyName === facultyName)) {
                        found = true;
                    }
                }
            });
        });
    });

    console.log(`Match Found: ${found}`);
}

debugMatch();
