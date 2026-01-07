const Timetable = require('../models/Timetable');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Faculty = require('../models/Faculty');
const Student = require('../models/Student');
const Rearrangement = require('../models/Rearrangement');

// 1. Delete Timetables
exports.deleteTimetables = async (req, res) => {
    try {
        const { departmentId } = req.query;

        // HOD: Delete only their dept timetables
        if (req.user.role === 'HOD') {
            if (!req.user.departmentId) return res.status(403).json({ message: "HOD has no department assigned." });
            await Timetable.deleteMany({ departmentId: req.user.departmentId });
            return res.json({ message: `Timetables for department ${req.user.departmentId} deleted.` });
        }

        // Admin: Specific Dept or ALL
        if (departmentId) {
            await Timetable.deleteMany({ departmentId });
            return res.json({ message: `Timetables for department ${departmentId} deleted.` });
        }

        // DELETE ALL
        await Timetable.deleteMany({});
        res.json({ message: "All Timetables deleted successfully." });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// 2. Delete Notifications
exports.deleteNotifications = async (req, res) => {
    try {
        if (req.user.role === 'HOD') {
            // Maybe allow clearing their own sent ones? 
            // For now matching previous logic: Deny/Clear Own?
            // Previous logic said: "Global notification clear is Admin only"
            // But let's allow them to clear notifications WHERE recipient is ALL or Dept? 
            // Let's stick to strict Admin only for GLOBAL clear.
            // But maybe clear notifications FOR this user?

            // If this is "Clear All System Notifications", then yes, Admin only.
            return res.status(403).json({ message: "Global notification clear is Admin only." });
        }

        await Notification.deleteMany({});
        res.json({ message: "All System Notifications deleted." });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 3. Delete Users
exports.deleteUsers = async (req, res) => {
    try {
        const { role } = req.query; // 'student', 'faculty', or 'all'

        let query = {};
        if (req.user.role === 'HOD') {
            // Only delete in their department
            query.departmentId = req.user.departmentId;
            // Only Students or Faculty
            if (role === 'student') query.role = 'Student';
            else if (role === 'faculty') query.role = 'Faculty';
            else query.role = { $in: ['Student', 'Faculty'] };
        } else {
            // Admin
            if (role && role !== 'all') {
                const roleMap = { 'student': 'Student', 'faculty': 'Faculty', 'admin': 'Admin' };
                query.role = roleMap[role.toLowerCase()] || role;
            }
            // Protect Admin?
            // query.role = { $ne: 'Admin' }; // Ideally don't delete self or other admins easily via bulk tool?
        }

        // Prevent deleting self
        query._id = { $ne: req.user._id };

        // 1. Find Users to delete
        const usersToDelete = await User.find(query);
        const userIds = usersToDelete.map(u => u._id);

        if (userIds.length === 0) return res.json({ message: "No users found to delete." });

        // 2. Delete Associated Profiles
        // We need to delete from Student/Faculty collections matching these UserIDs
        await Promise.all([
            Student.deleteMany({ userId: { $in: userIds } }),
            Faculty.deleteMany({ userId: { $in: userIds } }),
            User.deleteMany({ _id: { $in: userIds } })
        ]);

        res.json({ message: `Deleted ${userIds.length} users and associated records.` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// 4. Delete Rearrangements
exports.deleteRearrangements = async (req, res) => {
    try {
        const { departmentId, date } = req.query;

        let query = {};

        if (req.user.role === 'HOD') {
            query.departmentId = req.user.departmentId;
        } else if (departmentId) {
            query.departmentId = departmentId;
        }

        if (date) {
            query.date = date;
        }

        const result = await Rearrangement.deleteMany(query);

        res.json({ message: `Successfully deleted ${result.deletedCount} rearrangement requests.` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};
