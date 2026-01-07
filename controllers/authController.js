const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
        expiresIn: '30d',
    });
};

const registerUser = async (req, res) => {
    try {
        const { email, password, name, role } = req.body;

        if (!['Student', 'Faculty', 'Admin', 'HOD'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }

        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const user = await User.create({
            name,
            email,
            password,
            role
        });

        if (user) {
            res.status(201).json({
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    departmentId: user.departmentId, // Added
                },
                token: generateToken(user._id),
                message: 'User registered successfully'
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (user && (await user.matchPassword(password))) {
            res.json({
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    departmentId: user.departmentId, // Added
                },
                token: generateToken(user._id),
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (user) {
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                departmentId: user.departmentId, // Added
            });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const checkEmail = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (user) {
            return res.status(200).json({ exists: true });
        } else {
            return res.status(404).json({ exists: false, message: 'Email not registered' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error checking email' });
    }
};

module.exports = { registerUser, loginUser, getUserProfile, checkEmail };
