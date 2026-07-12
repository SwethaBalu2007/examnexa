// Netlify Serverless Function: Send OTP Email
// This runs on Netlify's servers - never sleeps, responds in milliseconds.
// Uses your Gmail credentials via Nodemailer.

const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const SMTP_HOST  = process.env.SMTP_HOST  || 'smtp.gmail.com';
const SMTP_PORT  = parseInt(process.env.SMTP_PORT) || 587;
const SMTP_FROM  = process.env.SMTP_FROM  || `NEXA Exam System <${EMAIL_USER}>`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { email, name, otp } = body;

  if (!email || !otp) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Email and OTP are required' }) };
  }

  // If email credentials are not configured, return mock mode
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.log(`[OTP-MOCK] No SMTP credentials. OTP for ${email}: ${otp}`);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, mock: true, otp, reason: 'SMTP not configured' })
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    });

    const html = `
      <div style="font-family:'Inter',-apple-system,sans-serif;max-width:520px;margin:0 auto;
        background:linear-gradient(135deg,#1e1e2d 0%,#2a2a3d 100%);
        border-radius:16px;overflow:hidden;border:1px solid rgba(108,99,255,0.2);">
        <div style="background:linear-gradient(135deg,#6C63FF 0%,#897DFF 100%);padding:32px 24px;text-align:center;">
          <div style="font-size:28px;font-weight:800;color:#fff;margin-bottom:4px">🔐 NEXA</div>
          <div style="color:rgba(255,255,255,0.8);font-size:14px">Password Reset Verification</div>
        </div>
        <div style="padding:32px 24px;color:#e0e0e0;">
          <p style="margin-top:0">Hello <strong>${name || 'User'}</strong>,</p>
          <p>You requested a password reset for your NEXA account. Use the OTP below:</p>
          <div style="background:rgba(108,99,255,0.15);border:2px dashed #6C63FF;
            border-radius:12px;padding:20px;text-align:center;margin:24px 0;
            letter-spacing:8px;font-size:32px;font-weight:800;color:#6C63FF;">
            ${otp}
          </div>
          <p style="color:#888;font-size:13px">⏰ This code expires in <strong>5 minutes</strong>.</p>
          <p style="color:#888;font-size:13px">If you didn't request this, please ignore this email.</p>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:24px 0">
          <p style="color:#666;font-size:12px;text-align:center;margin-bottom:0">NEXA Smart Exam Monitoring System</p>
        </div>
      </div>`;

    await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: '🔐 NEXA — Password Reset OTP',
      html,
    });

    console.log(`[OTP] Sent to ${email}`);
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ success: true, message: 'OTP sent to your email' })
    };

  } catch (err) {
    console.error('[OTP] Send failed:', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ success: false, error: err.message })
    };
  }
};
