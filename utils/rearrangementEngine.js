const Timetable = require('../models/Timetable');
const Faculty = require('../models/Faculty');
const Rearrangement = require('../models/Rearrangement');
const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Find available faculty for a specific day and period.
 */
exports.findAvailableSubstitutes = async (departmentId, date, slotId, requesterId) => {
    try {
        const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });

        // 1. Get all faculty in the department
        const allFaculty = await Faculty.find({ departmentId });

        // 2. Filter out requester
        let candidates = allFaculty.filter(f => f.userId && f.userId.toString() !== requesterId && f._id.toString() !== requesterId);

        // 3. Check for conflicts
        // Construct query key: schedule.{DayName}.{SlotId}.facultyId
        // Note: SlotId might need normalization if it differs between frontend/backend (e.g. "P1" vs "0")
        const busyQueryKey = `schedule.${dayName}.${slotId}.facultyId`;

        const busyTimetables = await Timetable.find({
            departmentId,
            isLive: true,
            [busyQueryKey]: { $exists: true }
        }).select(`schedule.${dayName}.${slotId}`);

        const busyFacultyIds = new Set();

        busyTimetables.forEach(tt => {
            const schedule = tt.schedule instanceof Map ? Object.fromEntries(tt.schedule) : tt.schedule;
            if (schedule && schedule[dayName] && schedule[dayName][slotId] && schedule[dayName][slotId].facultyId) {
                busyFacultyIds.add(schedule[dayName][slotId].facultyId);
            }
        });

        // Also check REARRANGEMENTS for that day!
        const rearrangements = await Rearrangement.find({
            date,
            slotId,
            status: 'accepted'
        });

        rearrangements.forEach(r => {
            busyFacultyIds.add(r.substituteId);
        });

        return candidates.filter(f => !busyFacultyIds.has(f.userId) && !busyFacultyIds.has(f._id.toString()));

    } catch (error) {
        console.error("Error finding substitutes:", error);
        throw error;
    }
};

/**
 * createRequest
 */
exports.createRequest = async (data) => {
    try {
        const newRearrangement = await Rearrangement.create({
            ...data,
            status: 'pending'
        });

        // Send Notification to Substitute
        await Notification.create({
            recipientId: data.substituteId,
            title: 'New Substitution Request',
            message: `${data.requesterName} needs help for ${data.className} at ${data.slotId}.`,
            type: 'request',
        });

        return { id: newRearrangement._id };
    } catch (e) {
        throw e;
    }
};

/**
 * respondToRequest
 */
exports.respondToRequest = async (requestId, status, responderId) => {
    try {
        const rearrangement = await Rearrangement.findById(requestId);
        if (!rearrangement) throw new Error("Request not found");

        if (rearrangement.substituteId !== responderId) {
            throw new Error("Unauthorized to respond to this request");
        }

        rearrangement.status = status;
        rearrangement.respondedAt = new Date();
        await rearrangement.save();

        // Notify Requester
        await Notification.create({
            recipientId: rearrangement.requesterId,
            title: `Request ${status === 'accepted' ? 'Accepted' : 'Rejected'}`,
            message: `${rearrangement.substituteName} has ${status} your request for ${rearrangement.classLabel || 'Class'}.`,
            type: 'response',
        });

        if (status === 'accepted') {
            // Notify HOD
            const hodUsers = await User.find({ role: 'HOD', departmentId: rearrangement.departmentId });
            for (const hod of hodUsers) {
                await Notification.create({
                    recipientId: hod._id,
                    title: 'Rearrangement Confirmed',
                    message: `REARRANGEMENT: ${rearrangement.subjectName} (${rearrangement.date}) managed by ${rearrangement.substituteName}`,
                    type: 'info'
                });
            }
        }

        return { status };
    } catch (e) {
        throw e;
    }
};

/**
 * handlePeriodAbsence
 */
exports.handlePeriodAbsence = async (facultyId, date, slotId, substituteId, extraDetails = {}) => {
    try {
        // 1. Get Requester Details
        let faculty = await Faculty.findOne({ userId: facultyId });
        if (!faculty) faculty = await Faculty.findById(facultyId);

        if (!faculty) throw new Error("Faculty not found");

        const requesterName = faculty.name;
        const deptId = faculty.departmentId;

        // 2. Find Substitute Details
        let substituteName = 'Target Faculty';
        let targetSubId = substituteId;

        const subFaculty = await Faculty.findOne({ userId: substituteId });
        if (subFaculty) {
            substituteName = subFaculty.name;
            targetSubId = subFaculty.userId;
        } else {
            const subById = await Faculty.findById(substituteId);
            if (subById) {
                substituteName = subById.name;
                targetSubId = subById.userId || subById._id.toString();
            }
        }

        let subjectName = extraDetails.subjectName || 'Unknown Subject';
        let className = extraDetails.className || 'Class';

        // 3. Find Class Details (from Timetable)
        const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
        const queryKey = `schedule.${dayName}.${slotId}.facultyId`;

        // Flexible query to find correct timetable
        let queryObj = { departmentId: deptId, isLive: true };
        queryObj[queryKey] = { $exists: true }; // Just find ONE live timetable for this department/slot first to verify

        // Note: Ideally queryObj[queryKey] SHOULD match faculty.userId / faculty._id
        // But if IDs are inconsistent (e.g. mongo id vs string), we rely on department+isLive Context
        const timetables = await Timetable.find(queryObj);

        let targetTimetable = null;
        for (let t of timetables) {
            const s = t.schedule instanceof Map ? Object.fromEntries(t.schedule) : t.schedule;
            const fId = s[dayName][slotId].facultyId;
            if (fId == faculty.userId || fId == faculty._id.toString()) { // Loose match
                targetTimetable = t;
                break;
            }
        }

        if (targetTimetable) {
            const s = targetTimetable.schedule instanceof Map ? Object.fromEntries(targetTimetable.schedule) : targetTimetable.schedule;
            const cell = s[dayName][slotId];
            subjectName = cell.subjectName || subjectName;
            className = `${targetTimetable.year} Year - ${targetTimetable.section}`;
        }

        const requestData = {
            requesterId: faculty.userId || faculty._id.toString(),
            requesterName,
            substituteId: targetSubId,
            substituteName,
            subjectName,
            className,
            classLabel: className,
            slotId,
            date,
            departmentId: deptId,
            status: 'pending'
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
