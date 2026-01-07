const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const Timetable = require('../models/Timetable');

// Helper to calculate hours
const calculateWorkload = async (departmentId) => {
    // Fetch all active timetables for the department
    // In Mongoose, we query using the metaData field if we stored it that way, 
    // BUT my Timetable model has top-level fields: departmentId, year, etc.
    // So I should match against those.

    // NOTE: In generatorRoutes I'll be saving to Timetable model. 
    // I need to ensure consistency. `Timetable` model has `departmentId`.

    let timetables = await Timetable.find({ departmentId, isLive: true });
    // DEBUG LOG
    console.log(`[Analytics] Found ${timetables.length} live timetables for dept ${departmentId}`);

    // FALLBACK: If no live timetable, get the latest created one for this department
    if (timetables.length === 0) {
        console.log(`[Analytics] No LIVE timetable found. Fetching latest...`);
        const latest = await Timetable.findOne({ departmentId }).sort({ createdAt: -1 });
        if (latest) {
            timetables = [latest];
            console.log(`[Analytics] Using fallback timetable: ${latest._id}`);
        }
    }

    const workloadMap = {}; // { "Faculty Name": { theory: 0, lab: 0, total: 0 } }

    timetables.forEach(doc => {
        const schedule = doc.schedule; // Map or Object
        if (!schedule) return;

        // DEBUG LOG
        console.log(`[Analytics] Processing schedule for Timetable ${doc._id}. Is Map? ${schedule instanceof Map}`);

        // map.values() if it is a Mongoose Map, or Object.values if POJO
        // Using `lean()` in query would make it POJO. `doc.schedule` is likely a Map if defined as Map.
        // Let's iterate safely.

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        days.forEach(day => {
            let daySlots;
            if (schedule instanceof Map) {
                daySlots = schedule.get(day);
            } else if (typeof schedule.get === 'function') {
                daySlots = schedule.get(day);
            } else {
                daySlots = schedule[day];
            }

            if (!daySlots) return;

            // Handle if daySlots is Mongoose Map or POJO
            // daySlots itself could be a Map of slotId -> Data
            let slotsArray = [];
            if (daySlots instanceof Map) {
                slotsArray = Array.from(daySlots.values());
            } else if (typeof daySlots === 'object') {
                slotsArray = Object.values(daySlots);
            }

            slotsArray.forEach(slotData => {
                if (!slotData || !slotData.facultyName) return;

                const fName = slotData.facultyName;
                if (!workloadMap[fName]) workloadMap[fName] = { theory: 0, lab: 0, total: 0 };

                if (slotData.type === 'Lab') {
                    // Lab usually counts as more hours or same? 
                    // Usually 1 period = 1 hour count, even if it is longer duration in reality.
                    // Or if a Lab spans 3 periods (P5,P6,P7), do we count it as 3?
                    // The schedule structure usually has P1, P2... keys.
                    // If P5, P6, P7 all have the same lab entry, it counts as 3.

                    workloadMap[fName].lab += 1;
                    workloadMap[fName].total += 1;
                } else {
                    workloadMap[fName].theory += 1;
                    workloadMap[fName].total += 1;
                }
            });
        });
    });

    return workloadMap;
};

// GET /api/analytics/workload
router.get('/workload', verifyToken, async (req, res) => {
    try {
        const { departmentId } = req.query;
        if (!departmentId) return res.status(400).json({ message: "Department ID is required" });

        const workload = await calculateWorkload(departmentId);

        // Convert to array for frontend
        const result = Object.entries(workload).map(([name, stats]) => ({
            name,
            ...stats
        })).sort((a, b) => b.total - a.total);

        res.status(200).json(result);
    } catch (error) {
        console.error("Analytics Error:", error);
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
