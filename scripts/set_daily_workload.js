const { admin, db } = require('../config/firebase');

const setDailyWorkload = async () => {
    try {
        console.log("--- UPDATING WORKLOAD TO 6 HOURS/WEEK (DAILY) ---");

        const subjectsRef = db.collection('subjects');
        const snapshot = await subjectsRef.get();

        if (snapshot.empty) {
            console.log("No subjects found.");
            process.exit(0);
        }

        const batch = db.batch();
        let count = 0;

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            // Only update THEORY subjects, ignore Labs and Fillers
            if (data.type !== 'Lab' && data.type !== 'Filler') {
                // Set hours to 6 to mandate Mon-Sat distribution
                const ref = subjectsRef.doc(doc.id);
                batch.update(ref, { hoursPerWeek: 6 });
                console.log(`Updated ${data.name} -> 6 Hours/Week`);
                count++;
            }
        });

        await batch.commit();
        console.log(`--- SUCCESS: Updated ${count} subjects to 6 hours/week. ---`);
        console.log("Please regenerate the timetable now.");
        process.exit(0);

    } catch (error) {
        console.error("Error updating workload:", error);
        process.exit(1);
    }
};

setDailyWorkload();
