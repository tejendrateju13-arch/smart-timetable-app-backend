const { admin, db } = require('../config/firebase');

const cleanup = async () => {
    try {
        console.log("Cleaning up old corrupted timetables...");

        // 1. Delete Active Timetables
        const batch = db.batch();
        const activeSnap = await db.collection('timetables').where('active', '==', true).get();
        activeSnap.docs.forEach(doc => {
            console.log(`Deleting active timetable: ${doc.id}`);
            batch.delete(doc.ref);
        });

        // 2. Delete Rearrangements
        const rearrangeSnap = await db.collection('rearrangements').get();
        rearrangeSnap.docs.forEach(doc => batch.delete(doc.ref));

        // 3. Delete Bad Faculty Records (Year 3-A etc)
        const facSnap = await db.collection('faculty').get();
        facSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.name && (data.name.includes('Year') || data.name.includes('Lab'))) {
                console.log(`Deleting corrupt faculty record: ${data.name}`);
                batch.delete(doc.ref);
            }
        });

        await batch.commit();
        console.log("Cleanup Complete. Please Regenerate Timetable now.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
};

cleanup();
