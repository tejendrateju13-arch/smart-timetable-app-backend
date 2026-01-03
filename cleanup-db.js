const { db, admin } = require('./config/firebase');

async function cleanup() {
    try {
        console.log('--- DB CLEANUP START ---');
        const deptSnap = await db.collection('departments').get();
        const deptMap = {}; // name (trimmed/upper) -> principal ID
        const toDeleteIds = [];
        const redirectMap = {}; // oldId -> newId

        for (const doc of deptSnap.docs) {
            const data = doc.data();
            const rawName = data.name || 'Unknown';
            const name = rawName.trim().toUpperCase();

            if (!deptMap[name]) {
                deptMap[name] = doc.id;
                console.log(`Keeping ${name} (ID: ${doc.id})`);
            } else {
                console.log(`Duplicate ${name} found (ID: ${doc.id}). Merging into ${deptMap[name]}`);
                toDeleteIds.push(doc.id);
                redirectMap[doc.id] = deptMap[name];
            }
        }

        if (Object.keys(redirectMap).length === 0) {
            console.log('No duplicates found needing merge.');
        } else {
            const collections = ['subjects', 'students', 'faculty', 'users'];
            for (const colName of collections) {
                console.log(`Processing collection: ${colName}`);
                const snap = await db.collection(colName).get();
                const batch = db.batch();
                let count = 0;

                for (const doc of snap.docs) {
                    const data = doc.data();
                    if (data.departmentId && redirectMap[data.departmentId]) {
                        batch.update(doc.ref, { departmentId: redirectMap[data.departmentId] });
                        count++;
                    }
                }

                if (count > 0) {
                    await batch.commit();
                    console.log(`- Updated ${count} records in ${colName}`);
                }
            }

            console.log('Deleting duplicate department documents...');
            for (const id of toDeleteIds) {
                await db.collection('departments').doc(id).delete();
                console.log(`- Deleted ${id}`);
            }
        }

        console.log('--- DB CLEANUP COMPLETE ---');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

cleanup();
