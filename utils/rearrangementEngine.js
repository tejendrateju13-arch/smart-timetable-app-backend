const { db, admin } = require('../config/firebase');

/**
 * Find available faculty for a specific day and period.
 * Constraints:
 * 1. Must be in the same department (optionally).
 * 2. Must NOT have a class in the given slot.
 * 3. Should not be the requester themselves.
 */
exports.findAvailableSubstitutes = async (departmentId, date, slotId, requesterId) => {
    try {
        const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });

        // 1. Get all faculty in the department
        const facultySnap = await db.collection('faculty')
            .where('departmentId', '==', departmentId)
            .get();

        const allFaculty = facultySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Filter out requester
        let candidates = allFaculty.filter(f => (f.uid !== requesterId) && (f.id !== requesterId));

        // 3. Check for conflicts
        // Strategy: Get all classes scheduled for this day/slot in this department.
        // Any faculty NOT in that list is free.

        const scheduleSnap = await db.collection('timetables')
            .where('departmentId', '==', departmentId)
            .where('isLive', '==', true)
            .limit(1)
            .get();

        if (scheduleSnap.empty) {
            console.warn("No live timetable found for validation. Returning all dept faculty.");
            return candidates;
        }

        const timetableData = scheduleSnap.docs[0].data();
        const busyFacultyIds = new Set();

        // Iterate all sections in the timetable
        Object.values(timetableData.schedule || {}).forEach(sectionData => {
            // sectionData is like { Monday: { P1: ... } }
            const dayData = sectionData[dayName];
            if (dayData && dayData[slotId]) {
                if (dayData[slotId].facultyId) busyFacultyIds.add(dayData[slotId].facultyId);
            }
        });

        // Also check REARRANGEMENTS for that day!
        // A faculty might be free in regular timetable but already accepted a substitution.
        const rearrangementsSnap = await db.collection('rearrangements')
            .where('date', '==', date)
            .where('slotId', '==', slotId)
            .where('status', '==', 'accepted')
            .get();

        rearrangementsSnap.docs.forEach(doc => {
            busyFacultyIds.add(doc.data().substituteFacultyId);
        });

        return candidates.filter(f => !busyFacultyIds.has(f.uid) && !busyFacultyIds.has(f.id));

    } catch (error) {
        console.error("Error finding substitutes:", error);
        throw error;
    }
};

// Duplicate createRequest removed. Using the one defined below.


/**
 * respondToRequest
 * Updates status to 'accepted' or 'rejected'.
 */
exports.respondToRequest = async (requestId, status, responderId) => {
    try {
        const docRef = db.collection('rearrangements').doc(requestId);
        const doc = await docRef.get();
        if (!doc.exists) throw new Error("Request not found");

        const data = doc.data();
        if (data.substituteId !== responderId) { // Check UID match
            throw new Error("Unauthorized to respond to this request");
        }

        await docRef.update({
            status,
            respondedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 1. Mark Substitute's Notification as actionTaken
        const notifSnap = await db.collection('notifications')
            .where('relatedId', '==', requestId)
            .where('userId', '==', responderId)
            .get();

        notifSnap.forEach(async (doc) => {
            await doc.ref.update({ actionTaken: true, read: true });
        });

        // 2. Notify Requester
        await db.collection('notifications').add({
            userId: data.requesterId, // Original requester
            title: `Request ${status === 'accepted' ? 'Accepted' : 'Rejected'}`,
            message: `${data.substituteName} has ${status} your request for ${data.className && data.className.includes('Unknown') ? 'Class' : data.className}.`,
            type: 'response',
            relatedId: requestId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            read: false
        });

        // 3. Notify HOD & Admin (Only if ACCEPTED)
        if (status === 'accepted') {
            const message = `REARRANGEMENT CONFIRMED:\nSubject: ${data.subjectName}\nClass: ${data.classLabel}\nPeriod: ${data.periodLabel}\nDate: ${data.date}\nFrom: ${data.originalFacultyName} -> ${data.substituteName}`;

            // Notify HOD
            const hodSnap = await db.collection('users')
                .where('role', '==', 'hod')
                .where('departmentId', '==', data.departmentId)
                .get();
            hodSnap.forEach(async (doc) => {
                await db.collection('notifications').add({
                    userId: doc.data().uid || doc.id,
                    title: 'Rearrangement Confirmed', // Consistent title
                    message,
                    type: 'info',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    read: false
                });
            });

            // Notify Admin
            const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
            adminSnap.forEach(async (doc) => {
                await db.collection('notifications').add({
                    userId: doc.data().uid || doc.id,
                    title: 'Rearrangement Confirmed',
                    message,
                    type: 'info',
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    read: false,
                    // Additional metadata for admin dashboard if needed
                    rearrangementId: requestId
                });
            });
        }

        return { status };
    } catch (e) {
        throw e;
    }
};

/**
 * handlePeriodAbsence
 * Validates ownership and creates a rearrangement request.
 */
exports.handlePeriodAbsence = async (facultyId, date, slotId, substituteId, extraDetails = {}) => {
    try {
        console.log(`[Rearrangement] Processing Absence: ${facultyId} | ${date} | ${slotId}`);
        console.log("Extra Details Received:", extraDetails);

        // 1. Get Requester Details
        const facultyDoc = await db.collection('faculty').doc(facultyId).get();
        // Fallback: try querying by uid if docId is not uid
        let facultyData = facultyDoc.exists ? facultyDoc.data() : null;
        if (!facultyData) {
            const q = await db.collection('faculty').where('uid', '==', facultyId).limit(1).get();
            if (!q.empty) facultyData = q.docs[0].data();
        }

        if (!facultyData) {
            facultyData = { name: "Faculty", uid: facultyId, departmentId: "Unknown" };
            console.warn("Faculty profile not found, proceeding with minimal info.");
        }

        const requesterName = facultyData.name;
        const deptId = facultyData.departmentId;

        // 2. Class & Subject Details (Use passed details if available)
        let subjectName = extraDetails.subjectName || 'Unknown Subject';
        let className = extraDetails.className || 'Class';
        let sourceTimetableId = null;

        // 3. Find Substitute Details
        let substituteName = 'Target Faculty';
        let targetSubUid = substituteId; // Default to ID passed

        if (substituteId) {
            const subDoc = await db.collection('faculty').doc(substituteId).get();
            if (subDoc.exists) {
                const data = subDoc.data();
                substituteName = data.name;
                if (data.uid) targetSubUid = data.uid; // Switch to UID if available
            } else {
                // Try User collection or assume name
                const uSnap = await db.collection('users').doc(substituteId).get();
                if (uSnap.exists) {
                    const data = uSnap.data();
                    substituteName = data.name;
                    // validUid?
                }
            }
        }

        // 3. Find Class Details (from Timetable)
        // We need to know SUBJECT and CLASS for the record
        // 3. Find Class Details (from Timetable)
        // We need to know SUBJECT and CLASS for the record
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOfWeek = days[new Date(date).getUTCDay()];

        console.log(`[Rearrange] Looking for ${requesterName} on ${dayOfWeek} (${date}) in slot ${slotId}`);


        let startTime = '';
        let endTime = '';


        // Try to fetch timetable to fill details
        if (deptId) {
            const ttSnap = await db.collection('timetables').where('departmentId', '==', deptId).get();
            for (const doc of ttSnap.docs) {
                const sched = doc.data().schedule?.[dayOfWeek];
                if (sched && sched[slotId]) {
                    const cell = sched[slotId];
                    // Check if this cell belongs to requester (fuzzy match or ID match)
                    const normalize = (s) => s ? s.toLowerCase().replace(/dr\.|prof\.|mr\.|mrs\.|\.| /g, '').trim() : '';
                    const isOwner = (cell.facultyId === facultyId) ||
                        (cell.facultyId === facultyData.uid) ||
                        (normalize(cell.facultyName) === normalize(requesterName));

                    if (isOwner) {
                        if (!subjectName || subjectName === 'Unknown Subject') {
                            subjectName = cell.subjectName || cell.subject || cell.name || 'Unknown Subject';
                        }
                        if (!className || className === 'Class') {
                            className = `${doc.data().year} Year ${doc.data().departmentName || ''} - Section ${doc.data().section}`;
                        }
                        sourceTimetableId = doc.id; // Capture ID
                        break;
                    }
                }
            }
        }

        if (subjectName === 'Unknown Subject') {
            console.error("Could not find subject for rearrangement. Timetable lookup failed.");
            // Optional: Throw error if strict mode required, but fallback is safer for now.
            // throw new Error("Could not find class details in timetable.");
        }

        const periodTimeLabel = startTime && endTime ? `(${startTime} - ${endTime})` : '';

        // 4. Create Request
        const requestData = {
            urgentFacultyId: facultyId,
            urgentFacultyName: requesterName,
            originalFacultyName: requesterName, // Explicit field
            requesterId: facultyId,
            requesterName,
            substituteFacultyId: targetSubUid,
            substituteFacultyName: substituteName, // Explicit field
            substituteId: targetSubUid,
            substituteName,
            subjectName: subjectName || 'Subject TBD', // Fallback
            className: className || 'Class',
            classLabel: className,
            periodLabel: `${slotId} ${periodTimeLabel}`,
            startTime,
            endTime,
            slotId,
            date,
            departmentId: deptId,
            sourceTimetableId, // Store the specific TT ID (if found)
            requesterUid: extraDetails.requesterUid || facultyId, // Store properly for query
            type: 'Main'
        };

        const result = await exports.createRequest(requestData);
        return {
            ...result,
            substituteName
        };

    } catch (e) {
        console.error("handlePeriodAbsence Error:", e);
        throw e;
    }
};

/**
 * createRequest
 * Creates a pending rearrangement request.
 */
exports.createRequest = async (data) => {
    try {
        const ref = await db.collection('rearrangements').add({
            ...data,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Send Notification to Substitute
        await db.collection('notifications').add({
            userId: data.substituteId, // Target UID
            title: 'New Substitution Request',
            message: `${data.requesterName} needs help for ${data.className} at ${data.slotId}.`,
            type: 'request',
            relatedId: ref.id,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            actionTaken: false
        });

        return { id: ref.id };
    } catch (e) {
        throw e;
    }
};
