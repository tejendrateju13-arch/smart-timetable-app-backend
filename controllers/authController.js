const { admin, db } = require('../config/firebase');
const EmailService = require('../services/emailService');

const registerUser = async (req, res) => {
    try {
        const { email, password, name, role } = req.body;

        if (!['Student', 'Faculty', 'Admin', 'HOD'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }

        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
        });

        await db.collection('users').doc(userRecord.uid).set({
            email,
            name,
            role,
            createdAt: new Date().toISOString()
        });

        res.status(201).json({ message: 'User registered successfully', userId: userRecord.uid });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getUserProfile = async (req, res) => {
    // Optimization: middleware already fetched the user profile or provided a fallback.
    // Just return it.
    try {
        if (!req.user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json(req.user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const checkEmail = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Check if user exists in Firebase Auth
        try {
            await admin.auth().getUserByEmail(email);
            return res.status(200).json({ exists: true });
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                return res.status(404).json({ exists: false, message: 'Email not registered' });
            }
            throw error;
        }
    } catch (error) {
        console.error('Check email error:', error);
        res.status(500).json({ message: 'Error checking email' });
    }
};

module.exports = { registerUser, getUserProfile, checkEmail };
