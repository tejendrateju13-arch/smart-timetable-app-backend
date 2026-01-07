const Department = require('../models/Department');
const Subject = require('../models/Subject');
const Faculty = require('../models/Faculty');
const Classroom = require('../models/Classroom');

// Generic Helpers can be removed or adapted, but standardizing Mongoose Find usage is better.
// I will keep the signatures but use Mongoose.

const addDepartment = async (req, res) => {
    try {
        const dept = await Department.create(req.body);
        res.status(201).json(dept);
    } catch (error) { res.status(500).json({ message: error.message }); }
};
const getDepartments = async (req, res) => {
    try {
        const depts = await Department.find();
        res.status(200).json(depts);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const addSubject = async (req, res) => {
    try {
        const item = await Subject.create(req.body);
        res.status(201).json(item);
    } catch (error) { res.status(500).json({ message: error.message }); }
};
const getSubjects = async (req, res) => {
    try {
        const items = await Subject.find();
        res.status(200).json(items);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const addFaculty = async (req, res) => {
    try {
        const item = await Faculty.create(req.body);
        res.status(201).json(item);
    } catch (error) { res.status(500).json({ message: error.message }); }
};
const getFaculty = async (req, res) => {
    try {
        const items = await Faculty.find();
        res.status(200).json(items);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const addClassroom = async (req, res) => {
    try {
        const item = await Classroom.create(req.body);
        res.status(201).json(item);
    } catch (error) { res.status(500).json({ message: error.message }); }
};
const getClassrooms = async (req, res) => {
    try {
        const items = await Classroom.find();
        res.status(200).json(items);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

module.exports = {
    addDepartment, getDepartments,
    addSubject, getSubjects,
    addFaculty, getFaculty,
    addClassroom, getClassrooms
};
