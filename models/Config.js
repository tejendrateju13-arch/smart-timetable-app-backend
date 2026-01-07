const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
    deptId: {
        type: String, // using deptId as key
        required: true,
        unique: true
    },
    slots: {
        type: [String], // Array of slot strings "P1", "P2" or objects
        default: []
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Config', configSchema);
