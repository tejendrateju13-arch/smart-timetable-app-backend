const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
    facultyId: {
        type: String, // UID
        required: true
    },
    facultyName: {
        type: String,
        required: true
    },
    departmentId: {
        type: String,
        default: null
    },
    startDate: {
        type: String, // YYYY-MM-DD
        required: true
    },
    endDate: {
        type: String, // YYYY-MM-DD
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    status: {
        type: String, // 'Pending', 'Approved', 'Rejected'
        enum: ['Pending', 'Approved', 'Rejected'],
        default: 'Pending'
    },
    appliedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Leave', leaveSchema);
