const express = require('express');
const cors = require('cors');
const http = require('http'); // Import HTTP module
const socketIo = require('socket.io'); // Import Socket.io
const connectDB = require('./config/db'); // Import DB Connection
require('dotenv').config();

const app = express();
const server = http.createServer(app); // Create server instance
const io = socketIo(server, {
    cors: {
        origin: "*", // Allow all origins for now
        methods: ["GET", "POST"]
    }
});

const PORT = 5000;

// Connect to Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.io Middleware to make io accessible in routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Socket.io Connection
io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected', socket.id);
    });
});

// Routes
const authRoutes = require('./routes/authRoutes');
const dataRoutes = require('./routes/dataRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const generatorRoutes = require('./routes/generatorRoutes');

const configRoutes = require('./routes/configRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/departments', require('./routes/departments'));
app.use('/api/faculty', require('./routes/faculty'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/classrooms', require('./routes/classrooms'));
app.use('/api/students', require('./routes/students'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/leaves', require('./routes/leaveRoutes'));
app.use('/api/data', dataRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/generator', generatorRoutes);
app.use('/api/config', configRoutes);
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));


// Basic Route
app.get('/', (req, res) => {
    res.send('Smart Timetable Scheduler API is running...');
});

app.get('/api', (req, res) => {
    res.send('Smart Timetable Scheduler API is running...');
});

// ipconfig
// Start Server
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port http://192.168.0.158:${PORT}`);
});

