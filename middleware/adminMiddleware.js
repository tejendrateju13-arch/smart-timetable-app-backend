const { db } = require('../config/firebase');

const verifyAdmin = async (req, res, next) => {
    if (!req.user || !req.user.uid) {
        return res.status(401).json({ message: 'Unauthorized: No user found' });
    }

    try {
        // Fetch full user profile if not already attached (depends on authMiddleware)
        // Ideally authMiddleware attaches basic auth info, but role might be in Firestore.
        // Let's assume authMiddleware attaches req.user. We need to check role.

        // Optimisation: If authMiddleware already fetched profile, use it.
        // If not, fetch it.

        let role = req.user.role;

        if (!role) {
            const userDoc = await db.collection('users').doc(req.user.uid).get();
            if (userDoc.exists) {
                role = userDoc.data().role;
            }
        }

        if (['Admin', 'HOD'].includes(role)) {
            next();
        } else {
            return res.status(403).json({ message: 'Forbidden: Access restricted' });
        }
    } catch (error) {
        console.error('Error verifying admin:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = verifyAdmin;
