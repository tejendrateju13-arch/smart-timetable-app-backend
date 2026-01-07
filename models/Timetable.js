const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
    departmentId: { type: String, required: true },
    year: { type: Number, required: true },
    semester: { type: Number, required: true },
    section: { type: String, required: true },

    isLive: { type: Boolean, default: true },

    // Structure: { Monday: { P1: { subject: '...', facultyId: '...' } } }
    schedule: {
        type: Map,
        of: mongoose.Schema.Types.Mixed // Using Mixed for flexibility as the structure is complex
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Timetable', timetableSchema);
