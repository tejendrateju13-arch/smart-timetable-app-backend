const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Department = require('./models/Department');
const Faculty = require('./models/Faculty');
const Student = require('./models/Student');
const Subject = require('./models/Subject');
const Classroom = require('./models/Classroom');

dotenv.config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/scheduler');
        console.log('MongoDB Connected for Seeding');
    } catch (err) {
        console.error('MongoDB Connection Failed:', err.message);
        process.exit(1);
    }
};

const seedData = async () => {
    await connectDB();

    try {
        console.log('--- STARTING SEED ---');

        // 1. Create Default Department
        console.log('Checking Departments...');
        let aidsDept = await Department.findOne({ name: 'AI&DS' });
        if (!aidsDept) {
            aidsDept = await Department.create({
                name: 'AI&DS',
                code: 'AIDS',
                programType: 'UG'
            });
            console.log('Created Dept: AI&DS');
        }

        // 2. Create Admin User
        console.log('Checking Admin...');
        const adminEmail = 'admin@sreerama.edu';
        const hashedPassword = await bcrypt.hash('sreerama123', 10);

        const adminUser = await User.findOneAndUpdate(
            { email: adminEmail },
            {
                name: 'System Administrator',
                email: adminEmail,
                password: hashedPassword,
                role: 'Admin',
                departmentId: null // Admin likely global
            },
            { upsert: true, new: true }
        );
        console.log('Admin Account Verified.');

        // 3. Create HOD
        console.log('Checking HOD...');
        const hodEmail = 'hod.aids@sreerama.edu';
        const hodPass = await bcrypt.hash('hod123', 10);

        const hodUser = await User.findOneAndUpdate(
            { email: hodEmail },
            {
                name: 'Dr. Swapna Sudha',
                email: hodEmail,
                password: hodPass,
                role: 'HOD',
                departmentId: aidsDept.name // Using name as ID reference based on current logic
            },
            { upsert: true, new: true }
        );
        console.log('HOD Account Verified.');

        // 4. Create Sample Faculty
        // Check if exists in User first
        // ... (Skipping verbose sample creation to avoid overwriting production data unnecessarily)
        // Just ensuring Admin/HOD/Dept exists is enough to start.

        console.log('--- SEEDING COMPLETE ---');
        process.exit(0);
    } catch (err) {
        console.error('Seeding Error:', err);
        process.exit(1);
    }
};

seedData();
