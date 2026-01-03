const { admin, db } = require('./config/firebase');

const USERS_TO_FIX = [
    { email: 'admin@sreerama.edu', password: 'sreerama123', role: 'Admin', name: 'System Administrator' },
    { email: 'hod.aids@sreerama.edu', password: 'hod123', role: 'HOD', name: 'Dr. Swapna Sudha' },
    { email: 'kiranmayi.ai@gmail.com', password: 'faculty123', role: 'Faculty', name: 'Kiranmayi' } // The specific faculty user mentioned in logs
];

const resetAuth = async () => {
    console.log("--- STARTING AUTH RESET ---");

    for (const u of USERS_TO_FIX) {
        try {
            console.log(`Processing ${u.email}...`);
            let uid;
            try {
                // Try to get existing user
                const userRecord = await admin.auth().getUserByEmail(u.email);
                uid = userRecord.uid;
                console.log(`   Found existing Auth account ${uid}. Updating password...`);
                // Force update password
                await admin.auth().updateUser(uid, {
                    password: u.password,
                    displayName: u.name
                });
            } catch (err) {
                if (err.code === 'auth/user-not-found') {
                    console.log(`   User not found. Creating new Auth account...`);
                    const newUser = await admin.auth().createUser({
                        email: u.email,
                        password: u.password,
                        displayName: u.name
                    });
                    uid = newUser.uid;
                } else {
                    throw err;
                }
            }

            // Sync with Firestore
            // Get Dept ID if possible (fallback to dummy for script)
            let deptId = 'CQMKzw3UW8pTVlH1B9kl'; // Known ID from logs or fetch fresh

            await db.collection('users').doc(uid).set({
                uid,
                email: u.email,
                name: u.name,
                role: u.role,
                departmentId: deptId,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            console.log(`   ✅ Success: ${u.email} / ${u.password}`);

        } catch (error) {
            console.error(`   ❌ Failed ${u.email}:`, error.message);
        }
    }
    console.log("--- DONE ---");
    process.exit(0);
};

resetAuth();
