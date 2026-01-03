const { db } = require('./config/firebase');

async function deepInspect() {
    try {
        console.log('--- DEEP INSPECTION ---');

        const depts = await db.collection('departments').get();
        console.log('\nDEPARTMENTS:');
        depts.forEach(d => console.log(`[${d.id}]: ${d.data().name}`));

        const subjects = await db.collection('subjects').limit(15).get();
        console.log('\nSUBJECTS (Sample):');
        subjects.forEach(s => {
            const data = s.data();
            console.log(`- ${data.name}`);
            console.log(`  Code: ${data.code}`);
            console.log(`  DeptID: ${data.departmentId} (type: ${typeof data.departmentId})`);
            console.log(`  Year: ${data.year} (type: ${typeof data.year})`);
            console.log(`  Sem: ${data.semester} (type: ${typeof data.semester})`);
        });

        const faculty = await db.collection('faculty').limit(5).get();
        console.log('\nFACULTY (Sample):');
        faculty.forEach(f => {
            const data = f.data();
            console.log(`- ${data.name}`);
            console.log(`  Years Assigned: ${JSON.stringify(data.years)}`);
        });

        console.log('\n--- END ---');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

deepInspect();
