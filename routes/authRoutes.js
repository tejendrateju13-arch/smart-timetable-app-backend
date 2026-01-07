const express = require('express');
const { registerUser, loginUser, getUserProfile, checkEmail } = require('../controllers/authController');
const verifyToken = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/profile', verifyToken, getUserProfile);
router.post('/check-email', checkEmail);

module.exports = router;
