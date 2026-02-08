const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const verifyAdmin = require('../middleware/adminMiddleware');
const { db } = require('../config/firebase');
const { generateTimetable } = require('../controllers/generatorController');
const EmailService = require('../services/emailService');

// 1. Trigger Generation (POST /generate)
router.post('/generate', verifyToken, verifyAdmin, generateTimetable);

// 2. Publish a Candidate (POST /publish)
router.post('/publish', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { candidateId, departmentId, year, semester, section, schedule, score, subjects, regulation, roomNumber, wef, classIncharge } = req.body;

        // If schedule is provided directly, use it. Otherwise try fallback (legacy).
        let finalSchedule = schedule;
        let finalScore = score;

        if (!finalSchedule) {
            // Get candidates from request body if passed, or fail
            const candidates = req.body.candidates || [];
            const selected = candidates.find(c => c.id === candidateId);
            if (!selected) return res.status(400).json({ message: 'Invalid candidate ID and no schedule provided' });
            finalSchedule = selected.schedule;
            finalScore = selected.score;
        }

        // VALIDATION: Ensure subjects are present
        if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
            console.warn("Publishing timetable without subjects metadata. Attempting to fetch or warn.");
            // Logic update: Ensure frontend sends it.
        }

        // Save as the "Active" timetable for this specific group
        const timetableId = `tt_${departmentId}_Y${year}_S${semester}_Sec${section}`;
        const timetableData = {
            schedule: finalSchedule,
            metaData: {
                departmentId,
                year: parseInt(year),
                semester: parseInt(semester),
                section,
                score: finalScore,
                subjects: subjects || [], // Correctly persist subjects
                // New Metadata Fields
                regulation: regulation || 'R23',
                roomNo: roomNumber || '',
                classIncharge: classIncharge || '',
                wef: wef || new Date().toISOString(),
                publishedAt: new Date().toISOString(),
                publishedBy: req.user.uid
            }
        };

        await db.collection('timetables').doc(timetableId).set(timetableData);
        // ALSO Save as 'active' for legacy frontend compatibility (default view)
        await db.collection('timetables').doc('active').set(timetableData);

        // Send notifications to faculty and students
        try {
            // Get all faculty for this department
            const facultySnap = await db.collection('faculty')
                .where('departmentId', '==', departmentId)
                .get();

            // Get all students for this year/semester/section
            const studentsSnap = await db.collection('students')
                .where('departmentId', '==', departmentId)
                .where('year', '==', parseInt(year))
                .where('semester', '==', parseInt(semester))
                .where('section', '==', section)
                .get();

            const batch = db.batch();
            const timestamp = new Date().toISOString();
            // CORRECT LINK FORMAT FIX
            const link = `/timetable?departmentId=${departmentId}&year=${year}&semester=${semester}&section=${section}`;

            // 1. Notify faculty
            for (const doc of facultySnap.docs) {
                const fData = doc.data();
                const notifRef = db.collection('notifications').doc();
                // Ensure we have a UID. Use uid field or doc.id
                const recipientId = fData.uid || doc.id;

                if (recipientId) {
                    batch.set(notifRef, {
                        recipientId: recipientId,
                        message: `New timetable published for Year ${year}, Semester ${semester}, Section ${section}`,
                        type: 'timetable',
                        link: link,
                        read: false,
                        timestamp: timestamp,
                        createdAt: timestamp
                    });

                    // SEND REAL EMAIL
                    EmailService.sendTimetableNotification(fData.email, fData.name, 'Faculty', 'AI&DS').catch(e => console.error("Email fail:", e));
                }
            }

            // 2. Notify HOD(s)
            const hodSnap = await db.collection('users')
                .where('role', '==', 'HOD')
                .where('departmentId', '==', departmentId)
                .get();

            for (const doc of hodSnap.docs) {
                const hData = doc.data();
                const notifRef = db.collection('notifications').doc();
                const recipientId = hData.uid || hData.id || doc.id;

                batch.set(notifRef, {
                    recipientId: recipientId,
                    message: `DEPT ALERT: New timetable published for Year ${year}, Sem ${semester}, Sec ${section}`,
                    type: 'timetable',
                    link: link,
                    read: false,
                    timestamp: timestamp,
                    createdAt: timestamp
                });

                // SEND REAL EMAIL
                if (hData.email) {
                    EmailService.sendTimetableNotification(hData.email, hData.name, 'HOD', 'AI&DS').catch(e => console.error("Email fail:", e));
                }
            }

            // 3. Notify students
            for (const doc of studentsSnap.docs) {
                const sData = doc.data();
                const notifRef = db.collection('notifications').doc();
                const recipientId = sData.uid || doc.id;

                if (recipientId) {
                    batch.set(notifRef, {
                        recipientId: recipientId,
                        message: `Your timetable for Semester ${semester} has been published!`,
                        type: 'timetable',
                        link: link,
                        read: false,
                        timestamp: timestamp,
                        createdAt: timestamp
                    });

                    // SEND REAL EMAIL
                    EmailService.sendTimetableNotification(sData.email, sData.name, 'Student', 'AI&DS').catch(e => console.error("Email fail:", e));
                }
            }

            await batch.commit();
        } catch (notifError) {
            console.error('Notification error:', notifError);
        }

        res.status(200).json({ message: 'Timetable Published Successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Publish failed' });
    }
});

// 4. Get Published Timetable (GET /published) - used by View View
// 4. Get Published Timetable (GET /published) - used by View View
router.get('/published', async (req, res) => {
    try {
        const { departmentId, year, semester, section } = req.query;
        console.log("GET /published params:", { departmentId, year, semester, section });

        // If no params, default to 'active' (legacy) or just return 400
        if (!departmentId || !year || !semester || !section) {
            // For now, let's try to find 'active' if it exists, or return 400
            const legacyDoc = await db.collection('timetables').doc('active').get();
            if (legacyDoc.exists) return res.status(200).json({ timetable: legacyDoc.data() });
            return res.status(400).json({ message: 'Missing filtering parameters' });
        }

        const timetableId = `tt_${departmentId}_Y${year}_S${semester}_Sec${section}`;
        console.log("Fetching timetable ID:", timetableId);
        const doc = await db.collection('timetables').doc(timetableId).get();

        if (!doc.exists) {
            console.warn("Timetable not found for ID:", timetableId);
            return res.status(200).json({ timetable: null });
        }
        res.status(200).json({ timetable: doc.data() });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching published timetable' });
    }
});

// 5. Get Consolidated Faculty Timetable (GET /faculty-consolidated)
router.get('/faculty-consolidated', verifyToken, async (req, res) => {
    try {
        const { departmentId, facultyName } = req.query;
        console.log("GET /faculty-consolidated params:", { departmentId, facultyName });

        // Fetch all published timetables for the department
        const snapshot = await db.collection('timetables')
            .where('metaData.departmentId', '==', departmentId)
            // .where('schedule', '!=', null) // Firestore limitation, can't check non-null easily with other filters sometimes
            .get();

        console.log("Found timetables count:", snapshot.size);

        if (snapshot.empty) {
            return res.status(200).json({ schedule: null });
        }

        const consolidated = {
            Monday: {}, Tuesday: {}, Wednesday: {}, Thursday: {}, Friday: {}, Saturday: {}
        };

        let found = false;

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const schedule = data.schedule;
            if (!schedule) return;

            // Robust extraction of Year/Section
            const meta = data.metaData || {};
            const year = meta.year || data.year || '?';
            const section = meta.section || data.section || '?';
            const classInfo = `Year ${year} - ${section}`;

            Object.keys(schedule).forEach(day => {
                if (consolidated[day]) {
                    const daySlots = schedule[day];
                    Object.keys(daySlots).forEach((key) => {
                        let slotId = key;
                        // Normalize 0-7 to P1-P8 if needed, but usually keys are ALREADY P1..P8
                        if (!isNaN(key)) slotId = `P${parseInt(key) + 1}`;

                        const slot = daySlots[key];
                        if (!slot) return;

                        // Check match by Name (Text) or ID (if available)
                        // Ideally we check ID, but legacy data might only have name.
                        // IMPROVEMENT: Case-insensitive match and trim
                        const normalize = (s) => s ? s.toString().trim().toLowerCase() : '';
                        const targetName = normalize(facultyName);

                        const slotFaculty = normalize(slot.faculty || slot.facultyName);
                        // const slotFacultyId = slot.facultyId; // Unused for now

                        // Identify if USER is the faculty for this slot
                        // RELAXED MATCHING: Check for partial inclusion
                        if (slotFaculty.includes(targetName) || targetName.includes(slotFaculty)) {
                            // console.log("Match found based on partial name:", targetName, "<->", slotFaculty);
                            found = true;

                            // If we already have a slot here (Conflict?), merge display
                            if (consolidated[day][slotId]) {
                                const existing = consolidated[day][slotId];
                                const newSubject = slot.subjectName || slot.subject || slot.name || slot.code || slot.subjectCode;

                                // Prevent duplicate subject names
                                if (!existing.subjectName.includes(newSubject)) {
                                    existing.subjectName += ` / ${newSubject}`;
                                }

                                if (!existing.className.includes(classInfo)) {
                                    const branch = doc.data().metaData?.departmentId || doc.data().departmentId || '';
                                    existing.className += ` & ${classInfo} - ${branch}`;
                                }
                            } else {
                                consolidated[day][slotId] = {
                                    subjectName: slot.subjectName || slot.subject || slot.name || slot.code || slot.subjectCode,
                                    facultyName: classInfo, // Show CLASS as the subtitle in the grid
                                    className: `${classInfo} - ${doc.data().metaData?.departmentId || doc.data().departmentId || ''}`,
                                    roomNumber: slot.roomNumber || slot.room,
                                    type: slot.type || 'Lecture',
                                    start: slot.start,
                                    end: slot.end,
                                    facultyId: slot.facultyId, // Preserve ID
                                    year: doc.data().metaData?.year || doc.data().year,
                                    section: doc.data().metaData?.section || doc.data().section,
                                    branch: doc.data().metaData?.departmentId || doc.data().departmentId || ''
                                };
                            }
                        }
                    });
                }
            });
        });

        console.log("Faculty Found in Schedule?", found);
        res.status(200).json({ schedule: found ? consolidated : null });

    } catch (error) {
        console.error("Error fetching faculty timetable:", error);
        res.status(500).json({ message: 'Failed to fetch faculty schedule' });
    }
});

// POST /api/generator/setup/force-daily-workload - Update Workload to 6 Hours
router.post('/setup/force-daily-workload', verifyToken, verifyAdmin, async (req, res) => {
    try {
        console.log("[Setup] Updating all Theory subjects to 6 Hours/Week...");
        const subjectsRef = db.collection('subjects');
        const snapshot = await subjectsRef.get();
        const batch = db.batch();
        let count = 0;

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            // Ignore labs and fillers
            if (data.type !== 'Lab' && data.type !== 'Filler') {
                const ref = subjectsRef.doc(doc.id);
                batch.update(ref, { hoursPerWeek: 6 });
                count++;
            }
        });

        await batch.commit();
        console.log(`[Setup] Updated ${count} subjects.`);
        res.status(200).json({ message: `Updated ${count} subjects to 6 Hours/Week (Daily Mode).` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
