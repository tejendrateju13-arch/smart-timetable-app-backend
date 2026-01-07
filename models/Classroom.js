const mongoose = require('mongoose');

const classroomSchema = new mongoose.Schema({
    roomNumber: {
        type: String,
        required: true,
        unique: true
    },
    roomType: {
        type: String, // 'Classroom', 'Lab'
        default: 'Classroom'
    },
    capacity: {
        type: Number,
        default: 60
    },
    facilities: [String]
}, {
    timestamps: true
});

module.exports = mongoose.model('Classroom', classroomSchema);
