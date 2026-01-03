const express = require('express');
const {
    addDepartment, getDepartments,
    addSubject, getSubjects,
    addFaculty, getFaculty,
    addClassroom, getClassrooms
} = require('../controllers/dataController');
const verifyToken = require('../middleware/authMiddleware');

const router = express.Router();

// All these routes should be protected, potentially admin only (role check to be added later)
// For now, we just check for a valid login token.

// Departments
router.post('/departments', verifyToken, addDepartment);
router.get('/departments', verifyToken, getDepartments);

// Subjects
router.post('/subjects', verifyToken, addSubject);
router.get('/subjects', verifyToken, getSubjects);

// Faculty
router.post('/faculty', verifyToken, addFaculty);
router.get('/faculty', verifyToken, getFaculty);

// Classrooms
router.post('/classrooms', verifyToken, addClassroom);
router.get('/classrooms', verifyToken, getClassrooms);

module.exports = router;
