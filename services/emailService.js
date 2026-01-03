const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

if (!process.env.EMAIL_USER) {
    console.warn("[EmailService] EMAIL_USER is missing. Emails will fail.");
} else {
    console.log("[EmailService] Configured with user:", process.env.EMAIL_USER);
}

/**
 * sendEmail
 * @param {string} to 
 * @param {string} subject 
 * @param {string} text 
 * @param {string} html 
 */
const sendEmail = async (to, subject, text, html) => {
    try {
        const info = await transporter.sendMail({
            from: `"Smart Scheduler" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
            html
        });
        console.log(`[EmailService] Email sent to ${to}: ${info.messageId}`);
        return info;
    } catch (error) {
        console.error('[EmailService] Send Error:', error);
        throw error;
    }
};

const sendPasswordReset = async (email, token) => {
    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?email=${email}&token=${token}`;
    const subject = 'Password Reset - Smart Scheduler';
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #2563eb;">Password Reset Request</h2>
            <p>You requested a password reset for your Smart Scheduler account.</p>
            <p>Please use the following token or click the button below to reset your password:</p>
            <div style="background: #f3f4f6; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 8px;">
                ${token}
            </div>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
            </div>
            <p style="font-size: 12px; color: #6b7280;">This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
        </div>
    `;
    return sendEmail(email, subject, `Your reset token is: ${token}`, html);
};

const sendTimetableNotification = async (email, name, role, departmentName) => {
    const subject = `Timetable Published - ${departmentName}`;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #2563eb;">Timetable Published</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>The new timetable for <strong>${departmentName}</strong> has been officially published.</p>
            <p>You can now log in to your dashboard as a <strong>${role}</strong> to view your personalized schedule.</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/timetable" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Timetable</a>
            </div>
            <p style="font-size: 12px; color: #6b7280;">This is an automated notification from Smart Scheduler.</p>
        </div>
    `;
    return sendEmail(email, subject, `The new timetable for ${departmentName} has been published.`, html);
};

const sendRearrangementAlert = async (email, name, details) => {
    const subject = `URGENT: Timetable Rearrangement - ${details.date}`;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #fab1a0; border-radius: 10px; background-color: #fffaf0;">
            <h2 style="color: #c0392b;">Emergency Rearrangement Notice</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>An emergency absence has triggered a rearrangement for today (<strong>${details.date}</strong>).</p>
            
            <div style="background: #fff; padding: 15px; border-left: 4px solid #e74c3c; margin: 15px 0;">
                <p style="margin: 5px 0;"><strong>Period:</strong> ${details.slotId}</p>
                <p style="margin: 5px 0;"><strong>Subject:</strong> ${details.subjectName}</p>
                <p style="margin: 5px 0;"><strong>Original Faculty:</strong> ${details.originalFaculty}</p>
                <p style="margin: 5px 0;"><strong>New Faculty:</strong> ${details.substituteName}</p>
                <p style="margin: 5px 0;"><strong>Class:</strong> ${details.year}-${details.section}</p>
            </div>

            <p>Please check your dashboard for the updated schedule.</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/faculty-dashboard" style="background: #c0392b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Dashboard</a>
            </div>
        </div>
    `;
    return sendEmail(email, subject, `Rearrangement for ${details.subjectName}`, html);
};

module.exports = {
    sendEmail,
    sendPasswordReset,
    sendTimetableNotification,
    sendRearrangementAlert
};
