const verifyAdmin = (req, res, next) => {
    // req.user is populated by authMiddleware (verifyToken)
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized: No user found' });
    }

    // Role is now part of the JWT payload and User model
    const { role } = req.user;

    if (['Admin', 'HOD'].includes(role)) {
        next();
    } else {
        return res.status(403).json({ message: 'Forbidden: Access restricted' });
    }
};

module.exports = verifyAdmin;
