const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    designation: {
        type: String,
        default: 'Faculty'
    },
    departmentId: {
        type: String,
        required: true
    },
    years: {
        type: [Number], // e.g., [1, 2]
        default: []
    },
    sections: {
        type: [String], // e.g., ['A', 'B']
        default: []
    },
    maxClassesPerDay: {
        type: Number,
        default: 2
    },
    workload: { // To track assigned hours
        type: Number,
        default: 0
    },
    availability: {
        type: mongoose.Schema.Types.Mixed, // Stores the availability matrix object
        default: {}
    },
    // New Fields
    weeklyWorkloadLimit: {
        type: Number,
        default: 18
    },
    averageLeavesPerMonth: {
        type: Number,
        default: 0
    },
    labEligibility: {
        type: String, // 'TheoryOnly', 'LabOnly', 'Both'
        default: 'Both'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Faculty', facultySchema);
