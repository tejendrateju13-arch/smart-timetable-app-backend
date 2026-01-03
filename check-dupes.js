const { db } = require('./config/firebase');

async function checkDuplicates() {
    try {
        const snap = await db.collection('departments').get();
        const counts = {};
        snap.docs.forEach(doc => {
            const name = doc.data().name;
            if (!counts[name]) counts[name] = [];
            counts[name].push(doc.id);
        });

        console.log('Department Counts by Name:');
        for (const name in counts) {
            console.log(`- ${name}: ${counts[name].length} instances [${counts[name].join(', ')}]`);
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

checkDuplicates();
