const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipientId: {
        type: String, // User ID or 'ALL'
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String, // 'info', 'warning', 'success'
        default: 'info'
    },
    read: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);
