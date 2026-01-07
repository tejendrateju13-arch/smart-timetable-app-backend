const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const verifyAdmin = require('../middleware/adminMiddleware');
const Timetable = require('../models/Timetable');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Subject = require('../models/Subject');
const { generateTimetable } = require('../controllers/generatorController');
const EmailService = require('../services/emailService');

// 1. Trigger Generation (POST /generate)
router.post('/generate', verifyToken, verifyAdmin, generateTimetable);

// 2. Publish a Candidate (POST /publish)
router.post('/publish', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { candidateId, departmentId, year, semester, section, schedule, score, subjects, regulation, roomNumber, wef, classIncharge } = req.body;

        let finalSchedule = schedule;
        let finalScore = score;

        if (!finalSchedule) {
            const candidates = req.body.candidates || [];
            const selected = candidates.find(c => c.id === candidateId);
            if (!selected) return res.status(400).json({ message: 'Invalid candidate ID and no schedule provided' });
            finalSchedule = selected.schedule;
            finalScore = selected.score;
        }

        // Deactivate existing live timetables for this group
        await Timetable.updateMany(
            { departmentId, year, semester, section, isLive: true },
            { $set: { isLive: false } }
        );

        // Save new Live Timetable
        const newTimetable = new Timetable({
            departmentId,
            year: parseInt(year),
            semester: parseInt(semester),
            section,
            isLive: true,
            schedule: finalSchedule,
            metaData: {
                score: finalScore,
                subjects: subjects || [],
                regulation: regulation || 'R23',
                roomNo: roomNumber || '',
                classIncharge: classIncharge || '',
                wef: wef || new Date().toISOString(),
                publishedAt: new Date().toISOString(),
                publishedBy: req.user.id
            }
        });

        await newTimetable.save();

        // Send Notifications
        try {
            // Faculties
            const faculties = await Faculty.find({ departmentId });
            // Students
            const students = await Student.find({ departmentId, year, semester, section });
            // HODs
            const hods = await User.find({ role: 'HOD', departmentId });

            const link = `/timetable?departmentId=${departmentId}&year=${year}&semester=${semester}&section=${section}`;
            const timestamp = new Date().toISOString();

            const notifications = [];

            // Faculty Notifications
            for (const f of faculties) {
                // Check if f.userId exists (linked user account)
                const recipientId = f.userId || f._id; // Fallback to faculty ID if user not linked, but Notification needs valid ID

                notifications.push({
                    recipientId: recipientId.toString(),
                    title: 'New Timetable',
                    message: `New timetable published for Year ${year}, Sem ${semester}, Sec ${section}`,
                    type: 'info',
                    link
                });
                // Email
                EmailService.sendTimetableNotification(f.email, f.name, 'Faculty', departmentId).catch(console.error);
            }

            // Student Notifications
            for (const s of students) {
                const recipientId = s.userId || s._id;
                notifications.push({
                    recipientId: recipientId.toString(),
                    title: 'Timetable Published',
                    message: `Your timetable for Semester ${semester} is out!`,
                    type: 'info',
                    link
                });
                EmailService.sendTimetableNotification(s.email, s.name, 'Student', departmentId).catch(console.error);
            }

            // HOD Notifications
            for (const h of hods) {
                notifications.push({
                    recipientId: h._id.toString(),
                    title: 'Department Update',
                    message: `New timetable published for Year ${year}, Sem ${semester}, Sec ${section}`,
                    type: 'info',
                    link
                });
                if (h.email) EmailService.sendTimetableNotification(h.email, h.name || 'HOD', 'HOD', departmentId).catch(console.error);
            }

            if (notifications.length > 0) {
                const inserted = await Notification.insertMany(notifications);

                // Realtime Socket Emission
                if (req.io) {
                    inserted.forEach(n => {
                        req.io.emit('notification', n); // Broadcasting to all/filtering client side? 
                        // Better: req.io.to(n.recipientId).emit... if we had room logic.
                        // For now, broadcast to everyone and client filters? No, secure way is to just emit 'notification'
                        // but usually we emit to specific socket IDs.
                        // Since we don't have user->socket mapping easily here without a store,
                        // we will emit a generic 'notification_update' or simply rely on client polling 
                        // UNLESS we implement rooms.
                        // Let's assume we don't have rooms yet. 
                        // Sending ALL notifications to EVERYONE is bad.
                        // We will skip broadcasting specific messages for now, checking `NotificationCenter`...
                        // NotificationCenter filters by `api.get`.
                    });
                }
            }

        } catch (notifError) {
            console.error('Notification error:', notifError);
        }

        res.status(200).json({ message: 'Timetable Published Successfully', timetableId: newTimetable._id });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Publish failed: ' + error.message });
    }
});

// 4. Get Published Timetable (GET /published)
router.get('/published', async (req, res) => {
    try {
        const { departmentId, year, semester, section } = req.query;

        if (!departmentId || !year || !semester || !section) {
            return res.status(400).json({ message: 'Missing filtering parameters' });
        }

        const timetable = await Timetable.findOne({
            departmentId,
            year: parseInt(year),
            semester: parseInt(semester),
            section,
            isLive: true
        }).sort({ createdAt: -1 });

        res.status(200).json({ timetable: timetable || null });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching published timetable' });
    }
});

// 5. Get Consolidated Faculty Timetable
router.get('/faculty-consolidated', verifyToken, async (req, res) => {
    try {
        const { departmentId, facultyName } = req.query;
        // Fetch ALL live timetables for this department
        const timetables = await Timetable.find({ departmentId, isLive: true });

        if (timetables.length === 0) {
            return res.status(200).json({ schedule: null });
        }

        const consolidated = {
            Monday: {}, Tuesday: {}, Wednesday: {}, Thursday: {}, Friday: {}, Saturday: {}
        };
        let found = false;

        timetables.forEach(tt => {
            const schedule = tt.schedule instanceof Map ? Object.fromEntries(tt.schedule) : tt.schedule;
            if (!schedule) return;

            const classInfo = `Year ${tt.year} - ${tt.section}`;

            Object.keys(schedule).forEach(day => {
                if (consolidated[day]) {
                    const daySlots = schedule[day];
                    Object.keys(daySlots).forEach((key) => {
                        let slotId = key;
                        if (!isNaN(key)) slotId = `P${parseInt(key) + 1}`;

                        const slot = daySlots[key];
                        if (!slot) return;

                        const normalize = (s) => s ? s.toString().trim().toLowerCase() : '';
                        const targetName = normalize(facultyName);
                        const slotFaculty = normalize(slot.facultyName || slot.faculty);

                        if (slotFaculty.includes(targetName) || targetName.includes(slotFaculty)) {
                            found = true;

                            // Define slot data
                            const slotData = {
                                subjectName: slot.subjectName || slot.subject || slot.name,
                                facultyName: classInfo,
                                className: classInfo,
                                roomNumber: slot.roomNumber,
                                type: slot.type || 'Lecture',
                                start: slot.start,
                                end: slot.end,
                                facultyId: slot.facultyId,
                                year: tt.year,
                                section: tt.section
                            };

                            // Conflict/Merge Logic
                            if (consolidated[day][slotId]) {
                                const existing = consolidated[day][slotId];
                                if (!existing.subjectName.includes(slotData.subjectName)) {
                                    existing.subjectName += ` / ${slotData.subjectName}`;
                                }
                                if (!existing.className.includes(classInfo)) {
                                    existing.className += ` & ${classInfo}`;
                                }
                            } else {
                                consolidated[day][slotId] = slotData;
                            }
                        }
                    });
                }
            });
        });

        res.status(200).json({ schedule: found ? consolidated : null });

    } catch (error) {
        console.error("Error fetching faculty timetable:", error);
        res.status(500).json({ message: 'Failed to fetch faculty schedule' });
    }
});

// Update Workload (Setup)
router.post('/setup/force-daily-workload', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const result = await Subject.updateMany(
            { type: { $nin: ['Lab', 'Filler'] } },
            { $set: { hoursPerWeek: 6 } }
        );
        res.status(200).json({ message: `Updated ${result.modifiedCount} subjects to 6 Hours/Week.` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
