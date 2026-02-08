const { db } = require('./config/firebase');

async function checkFaculty() {
    const names = ['V.K. Aparna', 'K. Swapna Sudha', 'B. Mahesh Naik', 'Govardhan', 'P. Kiranmayi', 'T. Deepika'];
    console.log(`Checking faculty availability for: ${names.join(', ')}`);

    try {
        const snapshot = await db.collection('faculty').where('name', 'in', names).get();
        if (snapshot.empty) {
            console.log('No faculty found.');
            return;
        }

        snapshot.docs.forEach(doc => {
            const f = doc.data();
            console.log(`\nFACULTY: ${f.name}`);
            if (f.availability) {
                console.log('Availability:', JSON.stringify(f.availability, null, 2));
            } else {
                console.log('Availability: ALL FREE (No matrix set)');
            }
        });
    } catch (error) {
        console.error("Error fetching faculty:", error);
    }
}

checkFaculty();
