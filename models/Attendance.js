const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    facultyId: {
        type: String, // UID
        required: true
    },
    name: {
        type: String,
        required: true
    },
    date: {
        type: String, // YYYY-MM-DD
        required: true
    },
    status: {
        type: String,
        enum: ['Present', 'Absent'],
        default: 'Present'
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Attendance', attendanceSchema);
