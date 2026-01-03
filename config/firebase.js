const admin = require('firebase-admin');
require('dotenv').config();

// Placeholder for service account path
// User needs to download serviceAccountKey.json from Firebase Console
// and place it in server/config/ or set environment variables.

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

try {
    // Check for environment variables first
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Replace escaped newlines if any
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            })
        });
    } else if (serviceAccountPath) {
        const path = require('path');
        const serviceAccount = require(path.resolve(serviceAccountPath));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        admin.initializeApp({
            credential: admin.credential.applicationDefault()
        });
    }
    console.log('Firebase Admin Initialized');
} catch (error) {
    console.error('Firebase Admin Initialization Failed:', error);
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
