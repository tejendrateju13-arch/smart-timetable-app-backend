const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/authMiddleware');
const verifyAdmin = require('../middleware/adminMiddleware'); // Check if this allows HOD too? Usually Admin only.
// If we want HOD access, we need a generic 'verifyManager' or check role inside controller.
// Let's use verifyToken and check role in controller for granularity.

const { deleteTimetables, deleteNotifications, deleteUsers, deleteRearrangements } = require('../controllers/adminController');

// All routes require valid login
router.use(verifyToken);

// Middleware to ensure Admin or HOD
const verifyManager = (req, res, next) => {
    const role = (req.user.role || '').toLowerCase(); // Normalize
    if (role === 'admin' || role === 'hod') {
        next();
    } else {
        return res.status(403).json({ message: "Access Denied: Admins/HODs only." });
    }
};

router.delete('/timetables', verifyManager, deleteTimetables);
router.delete('/notifications', verifyManager, deleteNotifications);
router.delete('/users', verifyManager, deleteUsers);
router.delete('/rearrangements', verifyManager, deleteRearrangements);

module.exports = router;
