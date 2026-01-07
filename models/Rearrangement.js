const mongoose = require('mongoose');

const rearrangementSchema = new mongoose.Schema({
    requesterId: { type: String, required: true }, // UID
    requesterName: { type: String, required: true },
    substituteId: { type: String, required: true }, // UID
    substituteName: { type: String, required: true },

    date: { type: String, required: true }, // YYYY-MM-DD
    slotId: { type: String, required: true }, // e.g. P1, P2

    subjectName: { type: String, default: 'Unknown Subject' },
    className: { type: String, default: 'Unknown Class' },
    classLabel: String,
    periodLabel: String,

    startTime: String,
    endTime: String,

    departmentId: String,
    sourceTimetableId: String,

    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },

    respondedAt: Date
}, {
    timestamps: true
});

module.exports = mongoose.model('Rearrangement', rearrangementSchema);
