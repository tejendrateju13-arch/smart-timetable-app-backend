const admin = require('firebase-admin');
const serviceAccount = require('./config/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function debug() {
    console.log('--- DEBUG START ---');

    const depts = await db.collection('departments').get();
    console.log('\nDepartments:');
    depts.forEach(d => console.log(`ID: ${d.id}, Name: ${d.data().name}`));

    const subjects = await db.collection('subjects').get();
    console.log('\nSubjects (Filtered for AI&DS):');
    subjects.forEach(s => {
        const data = s.data();
        console.log(`ID: ${s.id}, Name: ${data.name}, Dept: ${data.departmentId}, Y: ${data.year}, S: ${data.semester}`);
    });

    console.log('\n--- DEBUG END ---');
    process.exit(0);
}

debug().catch(console.error);
