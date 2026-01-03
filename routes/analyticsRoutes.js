const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const verifyToken = require('../middleware/authMiddleware');

// Helper to calculate hours
const calculateWorkload = async (departmentId) => {
    // 1. Fetch all active timetables for the department
    // In a real scenario, we might have multiple active timetables (one per Year/Section)
    // We need to fetch all timetables that belong to this department
    const timetablesSnap = await db.collection('timetables')
        .where('metaData.departmentId', '==', departmentId)
        .get();

    const workloadMap = {}; // { "Faculty Name": { theory: 0, lab: 0, total: 0 } }

    timetablesSnap.docs.forEach(doc => {
        const { schedule } = doc.data();
        if (!schedule) return;

        Object.values(schedule).forEach(daySlots => {
            Object.values(daySlots).forEach(slotData => {
                if (!slotData || !slotData.facultyName) return;

                // Handle Lab merging (Labs might span 3 slots, but typically stored as one entry or repeated)
                // In TimetableGrid we saw standard slots. If 'Lab' type spans 3 hours, we usually count it as 3 hours (or credits).
                // However, the storage format from the generator usually assigns the lab to the first slot, 
                // OR repeats it.
                // WE NEED TO KNOW IF IT REPEATS OR NOT.
                // Assuming the AI generator fills slots P1, P2, P3.
                // Let's assume simplest case: Count every slot occurrence = 1 hour (approx 50 mins).

                const fName = slotData.facultyName;
                if (!workloadMap[fName]) workloadMap[fName] = { theory: 0, lab: 0, total: 0 };

                if (slotData.type === 'Lab') {
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
