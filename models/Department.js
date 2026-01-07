const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    code: {
        type: String, // e.g., "AIDS"
        required: true,
        unique: true
    },
    hodId: {
        type: String, // Ref to User or Faculty ID
        default: null
    },
    programType: {
        type: String,
        enum: ['UG', 'PG'],
        default: 'UG'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Department', departmentSchema);
