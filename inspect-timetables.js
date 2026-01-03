const { db } = require('./config/firebase');

async function inspectTimetables() {
    try {
        console.log('Fetching timetables...');
        const snapshot = await db.collection('timetables').get();
        if (snapshot.empty) {
            console.log('No timetables found in DB.');
            return;
        }

        const uniqueFaculty = new Set();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const schedule = data.schedule;
            Object.values(schedule).forEach(daySlots => {
                // daySlots might be array or object
                const slots = Array.isArray(daySlots) ? daySlots : Object.values(daySlots);
                slots.forEach(slot => {
                    if (slot && slot.faculty) uniqueFaculty.add(slot.faculty);
                    if (slot && slot.facultyName) uniqueFaculty.add(slot.facultyName);
                });
            });
        });
        console.log("Faculty Names found in Timetables:", Array.from(uniqueFaculty));

    } catch (error) {
        console.error('Error:', error);
    }
}

inspectTimetables();
