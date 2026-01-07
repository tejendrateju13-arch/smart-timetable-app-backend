const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    code: {
        type: String,
        required: true
    },
    departmentId: {
        type: String,
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    semester: {
        type: Number,
        required: true
    },
    type: {
        type: String, // 'Theory' or 'Lab'
        enum: ['Theory', 'Lab'],
        default: 'Theory'
    },
    hoursPerWeek: {
        type: Number,
        default: 3
    },
    facultyName: {
        type: String,
        default: ''
    },
    facultyName2: {
        type: String, // For Labs if needed
        default: ''
    },
    // New Field: Pool of Eligible Faculty
    eligibleFaculty: {
        type: [String], // Array of Faculty Names
        default: []
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Subject', subjectSchema);
