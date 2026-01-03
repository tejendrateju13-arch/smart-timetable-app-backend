const { db } = require('../config/firebase');
const EmailService = require('./emailService');

const handleFacultyAbsence = async (facultyId, date) => {
    try {
        console.log(`[Rearrangement] Handling absence for Faculty ${facultyId} on ${date}`);

        // 1. Get the Day of the Week (e.g., 'Monday')
        const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
        if (dayName === 'Sunday') return; // No classes

        // 2. Get the Active Timetable
        // We assume 'timetables/active' holds the currently running schedule
        const activeDoc = await db.collection('timetables').doc('active').get();
        if (!activeDoc.exists) return;

        let timetableData = activeDoc.data();
        let schedule = timetableData.schedule; // { Day: { P1: {...}, P2: {...} } }

        if (!schedule || !schedule[dayName]) return;

        let updatesMade = false;
        let affected = []; // Fixed typo

        // 3. Scan the day's periods for this faculty
        const periods = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];

        // Better Strategy:
        // We need a list of ALL faculty.
        const allFacultySnap = await db.collection('faculty').get();
        let allFaculty = allFacultySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // FALLBACK: If faculty collection is too sparse, fetch from 'users' collection
        if (allFaculty.length < 2) {
            console.log("[Rearrangement] Faculty collection sparse, fetching from users...");
            const usersSnap = await db.collection('users').where('role', '==', 'Faculty').get();
            const userFaculty = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Merge checks
            userFaculty.forEach(u => {
                if (!allFaculty.find(f => f.id === u.id || f.uid === u.id)) {
                    allFaculty.push(u);
                }
            });
        }

        for (const p of periods) {
            const slot = schedule[dayName][p];
            if (slot && slot.facultyId === facultyId) {
                // Found a class needing substitution
                console.log(`[Rearrangement] Substitution needed for ${p}: ${slot.subjectName}`);

                // Find a substitute
                // A sub is free if they are NOT in the current schedule for this period
                // (Note: In a real uni, we'd check across all departments. Here we check the current schedule context)

                const busyFacultyIds = new Set();
                Object.values(schedule[dayName]).forEach(s => {
                    if (s && s.facultyId) busyFacultyIds.add(s.facultyId);
                });

                // Candidates: Same Dept preferred, but anyone free is okay
                let candidate = allFaculty.find(f =>
                    f.id !== facultyId &&
                    !busyFacultyIds.has(f.id) &&
                    f.departmentId === slot.departmentId // Try same dept first
                );

                if (!candidate) {
                    // Try different dept if needed (optional, skipping for now to strict same dept)
                    candidate = allFaculty.find(f =>
                        f.id !== facultyId &&
                        !busyFacultyIds.has(f.id)
                    );
                }

                if (candidate) {
                    // Apply Substitution
                    const originalFaculty = slot.facultyName;
                    slot.facultyId = candidate.id;
                    slot.facultyName = candidate.name + ' (Sub)';
                    slot.isSubstitution = true;
                    slot.originalFaculty = originalFaculty;

                    updatesMade = true;
                    affected.push(`${p}: ${slot.subjectName} -> ${candidate.name}`);
                } else {
                    slot.facultyName = 'CANCELLED (No Sub)';
                    updatesMade = true;
                    affected.push(`${p}: ${slot.subjectName} -> CANCELLED`);
                }
            }
        }

        // 4. Create NEW Timetable Version
        if (updatesMade) {
            // Deactivate old active (optional if we sort by date, but good for explicit history)
            // But for now, we just create a NEW doc that satisfies getLatestTimetable query (createdAt desc)

            const newTimetableRef = db.collection('timetables').doc(); // Auto ID
            const newTimetableData = {
                ...timetableData,
                schedule: schedule, // The updated schedule
                createdAt: new Date(), // Finds its way to top of "latest" query
                isRearranged: true,
                rearrangedForDate: date,
                originalTimetableId: activeDoc.id,
                affectedFaculty: activeDoc.data().affectedFaculty || []
            };

            // Add audit log
            newTimetableData.affectedFaculty.push({
                date: new Date(),
                changes: affected
            });

            await newTimetableRef.set(newTimetableData);

            console.log(`[Rearrangement] Created NEW active timetable: ${newTimetableRef.id}`);

            // 5. Notify HOD/Admin & Students
            const summary = `URGENT: Timetable Rearranged for ${date} (${dayName}).\nChanges:\n` + affected.join('\n');
            const timestamp = new Date().toISOString();
            const batch = db.batch();

            // A. Notify Admin (Cloud Firestore)
            const adminSnap = await db.collection('users').where('role', '==', 'Admin').get();
            adminSnap.forEach(doc => {
                const notifRef = db.collection('notifications').doc();
                batch.set(notifRef, {
                    recipientId: doc.data().uid || doc.id,
                    message: `[ALERT] Rearrangement for ${date}: ${affected.length} changes.`,
                    type: 'alert',
                    read: false,
                    link: '/admin/notifications',
                    createdAt: timestamp
                });
            });

            // B. Notify Substitute (Targeted)
            // We need to parse 'affected' array or better, track substitutions during the loop. 
            // For now, let's just broadcast to HOD.
            const hodSnap = await db.collection('users').where('role', '==', 'HOD').get();
            hodSnap.forEach(doc => {
                const notifRef = db.collection('notifications').doc();
                batch.set(notifRef, {
                    recipientId: doc.data().uid || doc.id,
                    message: `Rearrangement Triggered for ${date}. Check schedule.`,
                    type: 'info',
                    read: false,
                    link: '/admin/timetable',
                    createdAt: timestamp
                });
            });

            await batch.commit();

            // Send Email to Admin/HOD
            try {
                if (process.env.EMAIL_USER) {
                    await EmailService.sendEmail(
                        process.env.EMAIL_USER, // Admin
                        `[ALERT] Timetable Rearranged - ${dayName}`,
                        summary
                    );
                } else {
                    console.warn("[Rearrangement] EMAIL_USER not set. Skipping email alert.");
                }
            } catch (e) { console.warn("Failed to send admin email alert", e.message); }

            console.log("Notifications sent (Firestore + Email attempted).");
        } else {
            console.log("[Rearrangement] No suitable substitutes found or no classes to cover.");
        }

    } catch (error) {
        console.error('[Rearrangement] Error:', error);
    }
};

module.exports = { handleFacultyAbsence };
