const { admin, db } = require('../config/firebase');

const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Fetch additional user details from Firestore (Role, etc.)
        try {
            const userDoc = await db.collection('users').doc(decodedToken.uid).get();
            if (userDoc.exists) {
                req.user = { ...decodedToken, ...userDoc.data() };

                // CRITICAL FIX: If Student, ensure we have academic details (Year, Sem, Section)
                if (req.user.role === 'Student' && (!req.user.year || !req.user.section)) {
                    // Try UID first
                    let studentDoc = await db.collection('students').doc(decodedToken.uid).get();

                    // Fallback: Try Email Query if UID doc doesn't exist
                    if (!studentDoc.exists && req.user.email) {
                        const snap = await db.collection('students').where('email', '==', req.user.email).limit(1).get();
                        if (!snap.empty) studentDoc = snap.docs[0];
                    }

                    if (studentDoc && studentDoc.exists) {
                        const sData = studentDoc.data();
                        req.user.year = sData.year || req.user.year;
                        req.user.semester = sData.semester || req.user.semester;
                        req.user.section = sData.section || req.user.section;
                        req.user.departmentId = sData.departmentId || req.user.departmentId;
                        console.log(`[AUTH] Enriched Student ${req.user.email}: Y${req.user.year} S${req.user.semester} Sec${req.user.section}`);
                    } else {
                        console.warn(`[AUTH] Failed to find extended student details for ${req.user.email}`);
                    }
                }
            } else {
                // If not in 'users', check 'faculty' or 'students' directly
                const facultyDoc = await db.collection('faculty').doc(decodedToken.uid).get();
                if (facultyDoc.exists) {
                    req.user = { ...decodedToken, ...facultyDoc.data(), role: 'Faculty' };
                } else {
                    const studentDoc = await db.collection('students').doc(decodedToken.uid).get();
                    if (studentDoc.exists) {
                        req.user = { ...decodedToken, ...studentDoc.data(), role: 'Student' };
                    } else {
                        req.user = decodedToken;
                    }
                }
            }
        } catch (firestoreError) {
            console.error("Warning: Firestore fetch failed (likely quota). Using token data only.", firestoreError.message);
            req.user = decodedToken;
        }

        // FALLBACK: If role is still missing or we need to find the specific Faculty Doc ID
        // (Because 'users' collection stores Auth UID, but 'timetables' often refer to 'faculty' collection Doc ID)
        if (req.user.role === 'Faculty') {
            // Try to find the faculty document where uid == decodedToken.uid
            // (Or if the doc ID itself is the uid, we handle that too)
            try {
                const facSnap = await db.collection('faculty').where('uid', '==', decodedToken.uid).limit(1).get();
                if (!facSnap.empty) {
                    req.user.firestoreId = facSnap.docs[0].id;
                    // console.log(`[AUTH] Linked Faculty AuthUID ${decodedToken.uid} -> FirestoreID ${req.user.firestoreId}`);
                } else {
                    // Maybe the doc ID IS the uid?
                    const facDoc = await db.collection('faculty').doc(decodedToken.uid).get();
                    if (facDoc.exists) req.user.firestoreId = facDoc.id;
                }
            } catch (e) {
                console.warn("[AUTH] Failed to link Faculty Firestore ID:", e.message);
            }
        }

        // FALLBACK: If role is still missing (Quota error or DB delay), infer from email
        if (!req.user.role && req.user.email) {
            const email = req.user.email.toLowerCase();
            if (email.includes('admin') || email === 'tejen@gmail.com') req.user.role = 'Admin';
            else if (email.startsWith('hod')) req.user.role = 'HOD';
            else if (email.startsWith('prof') || email.startsWith('faculty')) req.user.role = 'Faculty';
            else if (email.startsWith('student')) req.user.role = 'Student';
        }

        // DEPARTMENT RESTRICTION: Only AI&DS allowed
        const email = req.user.email?.toLowerCase();
        // Allow Global Admin AND HODs to bypass the strict name check (assuming HODs are valid)
        // This unblocks 'hod.aids@...' if their DB record is missing the exact 'AI&DS' string.
        const isGlobalAdmin = email === 'tejen@gmail.com' || email?.includes('admin') || email?.startsWith('hod');

        if (!isGlobalAdmin) {
            let userDept = req.user.departmentName || '';

            // If we only have ID, try to get the name
            if (!userDept && req.user.departmentId) {
                try {
                    const deptDoc = await db.collection('departments').doc(req.user.departmentId).get();
                    if (deptDoc.exists) userDept = deptDoc.data().name;
                } catch (e) {
                    // Fallback to ID check if name fetch fails
                    userDept = req.user.departmentId;
                }
            }

            const allowedDepts = ['Artificial Intelligence and Data Science', 'AI&DS', 'aids_001'];
            const isAllowed = allowedDepts.some(d =>
                userDept.toLowerCase().includes('artificial') ||
                userDept.toLowerCase().includes('data science') ||
                userDept.toLowerCase().includes('ai&ds') ||
                userDept === 'aids_001'
            );

            if (!isAllowed) {
                console.warn(`[AUTH] Access Denied for ${email} - Dept: ${userDept}`);
                return res.status(403).json({
                    message: 'Access restricted to Artificial Intelligence & Data Science department only.'
                });
            }
        }

        next();
    } catch (error) {
        console.error('Error verifying token:', error);
        res.status(403).json({ message: 'Unauthorized' });
    }
};

module.exports = verifyToken;
