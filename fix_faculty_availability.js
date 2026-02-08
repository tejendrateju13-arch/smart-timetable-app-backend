const { db } = require('./config/firebase');

async function fixAvailability() {
    console.log('Fetching faculty: V.K. Aparna');
    const snapshot = await db.collection('faculty').where('name', '==', 'V.K. Aparna').get();

    if (snapshot.empty) {
        console.log('Faculty V.K. Aparna not found.');
        return;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Ensure availability object exists
    if (!data.availability) data.availability = {};
    if (!data.availability['Monday']) data.availability['Monday'] = {};

    // Clear P3 on Monday (Set to true)
    console.log('Current Monday Availability:', JSON.stringify(data.availability['Monday']));

    data.availability['Monday']['3'] = true;

    console.log('Updated Monday Availability:', JSON.stringify(data.availability['Monday']));

    await db.collection('faculty').doc(doc.id).update({
        availability: data.availability
    });

    console.log('Successfully updated availability for V.K. Aparna. P3 on Monday is now FREE.');
}

fixAvailability().catch(console.error);
