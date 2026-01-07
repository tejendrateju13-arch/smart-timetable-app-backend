const Timetable = require('../models/Timetable');
const Faculty = require('../models/Faculty');
const Notification = require('../models/Notification');
const User = require('../models/User');
const EmailService = require('./emailService');

const handleFacultyAbsence = async (facultyId, date) => {
    try {
        console.log(`[Rearrangement] Handling absence for Faculty ${facultyId} on ${date}`);

        const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
        if (dayName === 'Sunday') return;

        // Fetch ALL live timetables
        const liveTimetables = await Timetable.find({ isLive: true });

        let updatesMade = false;
        let affected = [];

        // Fetch all faculty for substitutions
        const allFaculty = await Faculty.find();

        for (const tt of liveTimetables) {
            // Check if this timetable has this faculty on this day
            const schedule = tt.schedule instanceof Map ? Object.fromEntries(tt.schedule) : tt.schedule;
            if (!schedule || !schedule[dayName]) continue;

            const daySlots = schedule[dayName];
            let modified = false;

            for (const [slotKey, slot] of Object.entries(daySlots)) {
                if (slot && slot.facultyId === facultyId) {
                    // Need substitution
                    console.log(`[Rearrangement] Sub needed for ${tt.departmentId} ${tt.year}-${tt.section} ${slotKey}: ${slot.subjectName}`);

                    // Find busy faculty in this period across ALL live timetables
                    const busyFacultyIds = new Set();
                    const allLive = await Timetable.find({ isLive: true });

                    allLive.forEach(lt => {
                        const ls = lt.schedule instanceof Map ? Object.fromEntries(lt.schedule) : lt.schedule;
                        if (ls && ls[dayName] && ls[dayName][slotKey] && ls[dayName][slotKey].facultyId) {
                            busyFacultyIds.add(ls[dayName][slotKey].facultyId);
                        }
                    });

                    // Candidates
                    let candidate = allFaculty.find(f =>
                        (f._id.toString() !== facultyId && f.userId !== facultyId) &&
                        !busyFacultyIds.has(f._id.toString()) &&
                        f.departmentId === tt.departmentId
                    );

                    if (!candidate) {
                        candidate = allFaculty.find(f =>
                            (f._id.toString() !== facultyId && f.userId !== facultyId) &&
                            !busyFacultyIds.has(f._id.toString())
                        );
                    }

                    if (candidate) {
                        // Apply Sub
                        slot.facultyId = candidate._id.toString();
                        slot.facultyName = candidate.name + ' (Sub)';
                        slot.originalFacultyId = facultyId;
                        slot.isSubstitution = true;

                        affected.push(`${slotKey} (${tt.departmentId} ${tt.year}-${tt.section}): ${slot.subjectName} -> ${candidate.name}`);
                        modified = true;
                    } else {
                        slot.facultyName = 'CANCELLED';
                        affected.push(`${slotKey} (${tt.departmentId} ${tt.year}-${tt.section}): ${slot.subjectName} -> CANCELLED`);
                        modified = true;
                    }
                }
            }

            if (modified) {
                // Update the specific timetable document
                // Mongoose Map update
                tt.markModified('schedule');
                await tt.save();
                updatesMade = true;
            }
        }

        if (updatesMade) {
            const summary = `URGENT: Timetable Rearranged for ${date}.\n` + affected.join('\n');

            // Notify Admin/HOD
            const admins = await User.find({ role: { $in: ['Admin', 'HOD'] } });
            const notifs = admins.map(u => ({
                recipientId: u._id,
                title: 'Rearrangement Alert',
                message: `Rearrangement for ${date}: ${affected.length} changes.`,
                type: 'warning'
            }));

            await Notification.insertMany(notifs);

            if (process.env.EMAIL_USER) {
                EmailService.sendEmail(process.env.EMAIL_USER, `[ALERT] Rearrangement - ${date}`, summary).catch(console.error);
            }

            console.log("[Rearrangement] Completed and notified.");
        } else {
            console.log("[Rearrangement] No classes found for this faculty on this date.");
        }

    } catch (error) {
        console.error('[Rearrangement] Error:', error);
    }
};

module.exports = { handleFacultyAbsence };
