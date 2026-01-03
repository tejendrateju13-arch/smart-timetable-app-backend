const express = require('express');
const { registerUser, getUserProfile, checkEmail } = require('../controllers/authController');
const verifyToken = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.get('/profile', verifyToken, getUserProfile);
router.post('/check-email', checkEmail);

module.exports = router;
