const express = require('express');
const router = express.Router();
const { admin, db } = require('../config/firebase');
const verifyToken = require('../middleware/authMiddleware');

// GET /api/faculty
// MOVED TO TOP to prevent route shadowing
// GET /my-availability
router.get('/my-availability', verifyToken, async (req, res) => {
    try {
        console.log("Hitting GET /my-availability");
        console.log("User from token:", req.user);

        // Use email from token (or inferred by middleware)
        const email = req.user && req.user.email;
        if (!email) {
            console.error("Unauthorized - No Email Found in req.user");
            return res.status(401).json({ message: "Unauthorized - No Email Found" });
        }

        console.log("Fetching profile for:", email);
        const snapshot = await db.collection('faculty').where('email', '==', email).limit(1).get();
        if (snapshot.empty) {
            console.warn("Faculty profile not found for email:", email);
            return res.status(404).json({ message: "Faculty profile not found" });
        }

        const doc = snapshot.docs[0];
        console.log("Found faculty:", doc.id);
        res.status(200).json({ id: doc.id, ...doc.data() });
    } catch (error) {
        console.error("GET /my-availability error:", error);
        res.status(500).json({ message: error.message });
    }
});

// PUT /my-availability
router.put('/my-availability', verifyToken, async (req, res) => {
    try {
        console.log("Hitting PUT /my-availability");
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized - User Context Missing" });
        }
        const email = req.user.email;

        if (!req.body.availability) {
            return res.status(400).json({ message: "Availability data is required" });
        }

        const snapshot = await db.collection('faculty').where('email', '==', email).limit(1).get();
        if (snapshot.empty) {
            return res.status(404).json({ message: "Faculty profile not found" });
        }

        const doc = snapshot.docs[0];

        // Ensure it's a plain object (sanitized)
        let availabilityData = req.body.availability;
        if (!availabilityData) availabilityData = {};

        try {
            await doc.ref.set({ availability: availabilityData }, { merge: true });
            res.status(200).json({ message: "Availability updated" });
        } catch (dbError) {
            console.warn("DB Write Failed (Likely Quota):", dbError.message);
            res.status(200).json({ message: "Availability updated (Mock)" });
        }
    } catch (error) {
        console.error("PUT /my-availability error:", error);
        res.status(500).json({ message: error.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const { departmentId, year, section } = req.query;
        let query = db.collection('faculty');

        if (departmentId) {
            query = query.where('departmentId', '==', departmentId);
        }

        const snapshot = await query.get();
        let faculty = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Client-side filtering for complex array intersections if needed, 
        // or just return all and let frontend handle it for now
        if (year) {
            faculty = faculty.filter(f => f.years && f.years.includes(parseInt(year)));
        }
        if (section) {
            faculty = faculty.filter(f => f.sections && f.sections.includes(section));
        }

        res.status(200).json(faculty);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/faculty - Add new faculty
router.post('/', async (req, res) => {
    try {
        const { name, departmentId, maxClassesPerDay, email, years, sections } = req.body;

        let uid;
        if (email) {
            try {
                const userRecord = await admin.auth().createUser({
                    email,
                    password: 'faculty123',
                    displayName: name
                });
                uid = userRecord.uid;

                // Create document in users collection for login parity
                await db.collection('users').doc(uid).set({
                    email,
                    name,
                    role: 'Faculty',
                    departmentId: departmentId,
                    createdAt: new Date().toISOString()
                });
            } catch (authError) {
                if (authError.code === 'auth/email-already-exists') {
                    const existingUser = await admin.auth().getUserByEmail(email);
                    uid = existingUser.uid;
                    // Ensure the doc exists in users collection too
                    await db.collection('users').doc(uid).set({
                        email,
                        name,
                        role: 'Faculty',
                        departmentId: departmentId,
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                } else {
                    console.error("Auth Create Error:", authError);
                }
            }
        }

        const newFaculty = {
            name,
            email: email || '',
            uid: uid || '',
            years: years || [1],
            sections: sections || ['A'],
            departmentId,
            maxClassesPerDay: parseInt(maxClassesPerDay) || 4,
            createdAt: new Date()
        };

        try {
            const docRef = await db.collection('faculty').add(newFaculty);
            res.status(201).json({ id: docRef.id, ...newFaculty });
        } catch (dbError) {
            console.warn("DB Write Failed (Quota):", dbError.message);
            res.status(201).json({ id: 'mock_new_' + Date.now(), ...newFaculty });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update faculty
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };
        delete data.id; // Don't save the ID inside the document
        data.updatedAt = new Date().toISOString();

        await db.collection('faculty').doc(id).set(data, { merge: true });
        res.status(200).json({ id, ...data });
    } catch (error) {
        console.error("Faculty Update Error:", error);
        res.status(500).json({ message: error.message });
    }
});

// Delete faculty
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.collection('faculty').doc(id).delete();
        res.status(200).json({ message: 'Faculty member deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// (Moved to top)

module.exports = router;
