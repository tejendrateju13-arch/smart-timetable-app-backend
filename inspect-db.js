const { db } = require('./config/firebase');

async function checkData() {
    try {
        console.log('--- DB INSPECTION START ---');
        const depts = await db.collection('departments').get();
        console.log('Departments Found:');
        const deptMap = {};
        depts.docs.forEach(d => {
            console.log(`- ${d.data().name} [ID: ${d.id}]`);
            deptMap[d.id] = d.data().name;
        });

        const collections = ['faculty', 'subjects', 'students'];
        for (const col of collections) {
            const snap = await db.collection(col).get();
            console.log(`\nCollection: ${col} (Total: ${snap.size})`);
            const counts = {};
            snap.docs.forEach(doc => {
                const dId = doc.data().departmentId;
                const dName = deptMap[dId] || `Unknown (${dId})`;
                counts[dName] = (counts[dName] || 0) + 1;
            });
            for (const name in counts) {
                console.log(`- ${name}: ${counts[name]}`);
            }
        }

        console.log('\n--- DB INSPECTION END ---');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkData();
