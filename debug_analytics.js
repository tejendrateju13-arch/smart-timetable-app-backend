const mongoose = require('mongoose');
const Timetable = require('./models/Timetable'); // Adjust path if needed
const Department = require('./models/Department'); // Adjust path
require('dotenv').config();

const runDebug = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smart_timetable');
        console.log('DB Connected');

        // 1. Find Department
        const dept = await Department.findOne({ name: { $regex: 'AI&DS', $options: 'i' } });
        if (!dept) {
            console.log('Department AI&DS not found');
            return;
        }
        console.log('Department found:', dept._id, dept.name);

        // 2. Find Timetables
        const liveTimetables = await Timetable.find({ departmentId: dept._id, isLive: true });
        console.log(`Live Timetables count: ${liveTimetables.length}`);

        if (liveTimetables.length > 0) {
            console.log('Sample Live Timetable:', JSON.stringify(liveTimetables[0].schedule, null, 2).substring(0, 500) + '...');
        }

        const allTimetables = await Timetable.find({ departmentId: dept._id }).sort({ createdAt: -1 }).limit(1);
        console.log(`Latest Timetable (any status) found: ${allTimetables.length > 0}`);
        if (allTimetables.length > 0) {
            console.log('Latest ID:', allTimetables[0]._id);
            console.log('Latest isLive:', allTimetables[0].isLive);
            console.log('Latest Schedule Type:', typeof allTimetables[0].schedule);
            // console.log('Latest Schedule Keys:', Array.from(allTimetables[0].schedule.keys()));
        }

    } catch (e) {
        console.error(e);
    } finally {
        mongoose.disconnect();
    }
};

runDebug();
