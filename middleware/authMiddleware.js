const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');

const verifyToken = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');

            req.user = await User.findById(decoded.id).select('-password');
            if (!req.user) {
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            // Hydrate with Student or Faculty specific details
            if (req.user.role === 'Student') {
                const student = await Student.findOne({ email: req.user.email });
                if (student) {
                    req.user.studentDetails = student;
                    req.user.year = student.year;
                    req.user.semester = student.semester;
                    req.user.section = student.section;
                    req.user.departmentId = student.departmentId;
                }
            } else if (req.user.role === 'Faculty') {
                const faculty = await Faculty.findOne({ email: req.user.email });
                if (faculty) {
                    req.user.facultyDetails = faculty;
                    req.user.departmentId = faculty.departmentId;
                    req.user.firestoreId = faculty._id; // Keep legacy field name for compatibility if needed
                }
            }

            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

module.exports = verifyToken;
