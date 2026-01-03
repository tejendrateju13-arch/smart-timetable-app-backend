const { db } = require('../config/firebase');

// Generic Helper for adding data
const addData = async (collectionName, data, res) => {
    try {
        const docRef = await db.collection(collectionName).add(data);
        res.status(201).json({ id: docRef.id, ...data });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Generic Helper for fetching data
const getData = async (collectionName, res) => {
    try {
        const snapshot = await db.collection(collectionName).get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Departments
const addDepartment = (req, res) => addData('departments', req.body, res);
const getDepartments = (req, res) => getData('departments', res);

// Subjects
const addSubject = (req, res) => addData('subjects', req.body, res);
const getSubjects = (req, res) => getData('subjects', res);

// Faculty
const addFaculty = (req, res) => addData('faculty', req.body, res);
const getFaculty = (req, res) => getData('faculty', res);

// Classrooms
const addClassroom = (req, res) => addData('classrooms', req.body, res);
const getClassrooms = (req, res) => getData('classrooms', res);

module.exports = {
    addDepartment, getDepartments,
    addSubject, getSubjects,
    addFaculty, getFaculty,
    addClassroom, getClassrooms
};
