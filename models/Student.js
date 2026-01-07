const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    name: {
        type: String,
        required: true
    },
    studentId: { // Roll Number
        type: String,
        required: true,
        unique: true
    },
    email: {
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
    section: {
        type: String,
        default: 'A'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Student', studentSchema);
