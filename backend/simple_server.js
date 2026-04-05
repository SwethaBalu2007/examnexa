const http = require('http');
const fs = require('fs');
const path = require('path');

// Load environment variables
try { require('dotenv').config(); } catch (_) {}

const PORT = process.env.PORT || 8080;
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
const DB_PATH = path.join(__dirname, 'database.json');

// ─── Cloud Database Logic ─────────────────────────────────────
let cloudDatabase = {
  nexa_users: [],
  nexa_exams: [],
  nexa_results: [],
  nexa_warnings: [],
  nexa_notifications: [],
  nexa_settings: {}
};

// Load database if it exists
if (fs.existsSync(DB_PATH)) {
  try {
    cloudDatabase = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    console.log('📦 Cloud Database loaded successfully.');
  } catch (e) {
    console.error('❌ Error loading database:', e.message);
  }
}

function saveDatabase() {
  try {
    // Only save keys that are expected
    const keysToSave = ['nexa_users', 'nexa_exams', 'nexa_results', 'nexa_warnings', 'nexa_notifications', 'nexa_settings'];
    const dataToSave = {};
    keysToSave.forEach(k => {
      if (cloudDatabase[k] !== undefined) dataToSave[k] = cloudDatabase[k];
    });
    fs.writeFileSync(DB_PATH, JSON.stringify(dataToSave, null, 2));
  } catch (e) {
    console.error('❌ Error saving database:', e.message);
  }
}

// ─── SMTP Email Configuration ─────────────────────────────────
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
const smtpUser = process.env.EMAIL_USER || process.env.SMTP_USER;
const smtpPass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || `NEXA Exam System <${smtpUser}>`;

const isConfigured = smtpHost && smtpUser && smtpPass && 
                   !smtpUser.includes('your-email') && 
                   !smtpPass.includes('your-16-char');

let emailTransporter = null;
let smtpReady = false;

if (isConfigured) {
  try {
    const nodemailer = require('nodemailer');
    emailTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    emailTransporter.verify((err) => {
      if (err) {
        console.warn('⚠️ SMTP Connection Error:', err.message);
        console.log('   Email features will run in MOCK mode.');
      } else {
        smtpReady = true;
        console.log('📧 Email system ready (SMTP Connected)');
      }
    });
  } catch (err) {
    console.warn('⚠️ Nodemailer missing. Running in MOCK mode.');
  }
} else {
  console.log('⚠️ Email credentials missing. Running in MOCK mode.');
}

// ─── OTP Store (in-memory, per-email) ─────────────────────────
const otpStore = new Map();
const OTP_EXPIRY_MS = (parseInt(process.env.OTP_EXPIRY_MINUTES) || 5) * 60 * 1000;
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS) || 3;

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function storeOTP(email, otp) {
  otpStore.set(email.toLowerCase(), {
    otp,
    createdAt: Date.now(),
    attempts: 0,
  });
}

function verifyOTP(email, userOtp) {
  const key = email.toLowerCase();
  const entry = otpStore.get(key);
  if (!entry) return { valid: false, error: 'No OTP found. Please request a new one.' };
  if (Date.now() - entry.createdAt > OTP_EXPIRY_MS) {
    otpStore.delete(key);
    return { valid: false, error: 'OTP has expired. Please request a new one.' };
  }
  entry.attempts++;
  if (entry.attempts > OTP_MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { valid: false, error: 'Too many attempts. Please request a new OTP.' };
  }
  if (entry.otp !== userOtp) {
    return { valid: false, error: `Incorrect OTP. ${OTP_MAX_ATTEMPTS - entry.attempts} attempt(s) remaining.` };
  }
  otpStore.delete(key);
  return { valid: true };
}

// ─── Email Templates ──────────────────────────────────────────
function getEmailTemplate(type, data) {
  const baseStyle = `
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    max-width: 520px; margin: 0 auto;
    background: linear-gradient(135deg, #1e1e2d 0%, #2a2a3d 100%);
    border-radius: 16px; overflow: hidden;
    border: 1px solid rgba(108, 99, 255, 0.2);
  `;
  const headerStyle = `
    background: linear-gradient(135deg, #6C63FF 0%, #897DFF 100%);
    padding: 32px 24px; text-align: center;
  `;
  const bodyStyle = `padding: 32px 24px; color: #e0e0e0;`;
  const otpStyle = `
    background: rgba(108, 99, 255, 0.15); border: 2px dashed #6C63FF;
    border-radius: 12px; padding: 20px; text-align: center;
    margin: 24px 0; letter-spacing: 8px;
    font-size: 32px; font-weight: 800; color: #6C63FF;
  `;

  switch (type) {
    case 'otp':
      return `
        <div style="${baseStyle}">
          <div style="${headerStyle}">
            <div style="font-size:28px;font-weight:800;color:#fff;margin-bottom:4px">🔐 NEXA</div>
            <div style="color:rgba(255,255,255,0.8);font-size:14px">Password Reset Verification</div>
          </div>
          <div style="${bodyStyle}">
            <p style="margin-top:0">Hello <strong>${data.name || 'User'}</strong>,</p>
            <p>You requested a password reset for your NEXA account. Use the OTP below to verify your identity:</p>
            <div style="${otpStyle}">${data.otp}</div>
            <p style="color:#888;font-size:13px">⏰ This code expires in <strong>${process.env.OTP_EXPIRY_MINUTES || 5} minutes</strong>.</p>
            <p style="color:#888;font-size:13px">If you didn't request this, please ignore this email.</p>
            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:24px 0">
            <p style="color:#666;font-size:12px;text-align:center;margin-bottom:0">NEXA Smart Exam Monitoring System</p>
          </div>
        </div>`;

    case 'welcome':
      return `
        <div style="${baseStyle}">
          <div style="${headerStyle}">
            <div style="font-size:28px;font-weight:800;color:#fff;margin-bottom:4px">🎓 NEXA</div>
            <div style="color:rgba(255,255,255,0.8);font-size:14px">Welcome to Smart Exam Monitoring</div>
          </div>
          <div style="${bodyStyle}">
            <p style="margin-top:0">Hello <strong>${data.name}</strong>! 🎉</p>
            <p>Your NEXA account has been created successfully.</p>
            <div style="background:rgba(0,212,170,0.1);border-left:4px solid #00d4aa;padding:16px;border-radius:8px;margin:20px 0">
              <div style="font-size:13px;color:#888;margin-bottom:4px">Account Details</div>
              <div style="color:#e0e0e0"><strong>Name:</strong> ${data.name}</div>
              <div style="color:#e0e0e0"><strong>Email:</strong> ${data.email}</div>
              <div style="color:#e0e0e0"><strong>Role:</strong> ${data.role}</div>
            </div>
            <p>You can now sign in and start using the platform.</p>
            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:24px 0">
            <p style="color:#666;font-size:12px;text-align:center;margin-bottom:0">NEXA Smart Exam Monitoring System</p>
          </div>
        </div>`;

    case 'notification':
      return `
        <div style="${baseStyle}">
          <div style="${headerStyle}">
            <div style="font-size:28px;font-weight:800;color:#fff;margin-bottom:4px">📢 NEXA</div>
            <div style="color:rgba(255,255,255,0.8);font-size:14px">${data.subject || 'Notification'}</div>
          </div>
          <div style="${bodyStyle}">
            <p style="margin-top:0">Hello <strong>${data.name || 'User'}</strong>,</p>
            <div style="color:#e0e0e0;line-height:1.7">${data.message}</div>
            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:24px 0">
            <p style="color:#666;font-size:12px;text-align:center;margin-bottom:0">NEXA Smart Exam Monitoring System</p>
          </div>
        </div>`;

    default:
      return `<p>${data.message || ''}</p>`;
  }
}

async function sendEmail(to, subject, htmlBody) {
  if (!emailTransporter || !smtpReady) {
    console.log(`[EMAIL-MOCK] To: ${to} | Subject: ${subject}`);
    return { success: true, mock: true };
  }
  try {
    // Send to the requested recipient AND CC the admin email from .env
    const recipients = [to];
    if (process.env.EMAIL_USER && process.env.EMAIL_USER !== to) {
      recipients.push(process.env.EMAIL_USER);
    }

    const info = await emailTransporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients.join(', '),
      subject,
      html: htmlBody,
    });
    console.log(`[EMAIL] Sent to ${recipients.join(', ')}: ${subject} (${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EMAIL] Failed to send to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}


// Ensure recordings directory exists
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.wav':  'audio/wav',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'application/font-woff',
  '.ttf':  'application/font-ttf',
  '.eot':  'application/vnd.ms-fontobject',
  '.otf':  'application/font-otf',
  '.wasm': 'application/wasm',
};

// ─── Helpers ──────────────────────────────────────────────────
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function sendError(res, code, message) {
  sendJSON(res, code, { success: false, error: message });
}

// ─── Multipart Parser ────────────────────────────────────────
// Parses a multipart/form-data body into { fields, files }
// files[name] = { filename, contentType, data: Buffer }
function parseMultipart(boundary, bodyBuffer) {
  const fields = {};
  const files = {};
  const delimiter = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  for (let i = 0; i <= bodyBuffer.length - delimiter.length; i++) {
    if (bodyBuffer.slice(i, i + delimiter.length).equals(delimiter)) {
      if (start > 0) parts.push(bodyBuffer.slice(start, i - 2)); // -2 for \r\n before boundary
      start = i + delimiter.length + 2; // skip \r\n after boundary
      i += delimiter.length - 1;
    }
  }

  parts.forEach(part => {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const headerStr = part.slice(0, headerEnd).toString('utf8');
    const body = part.slice(headerEnd + 4);

    const dispositionMatch = headerStr.match(/Content-Disposition:.*?name="([^"]+)"/i);
    const filenameMatch = headerStr.match(/Content-Disposition:.*?filename="([^"]+)"/i);
    const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);

    if (!dispositionMatch) return;
    const name = dispositionMatch[1];

    if (filenameMatch) {
      files[name] = {
        filename: filenameMatch[1],
        contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
        data: body,
      };
    } else {
      fields[name] = body.toString('utf8').trim();
    }
  });

  return { fields, files };
}

// ─── API Handlers ─────────────────────────────────────────────

// POST /api/upload-recording
// Form fields: studentId, examId, studentName, examTitle
// Form file:   recording (video/webm)
function handleUpload(req, res) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)/i);
  if (!boundaryMatch) return sendError(res, 400, 'Missing multipart boundary');
  const boundary = boundaryMatch[1];

  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    try {
      const bodyBuffer = Buffer.concat(chunks);
      const { fields, files } = parseMultipart(boundary, bodyBuffer);

      const { studentId, examId, studentName, examTitle } = fields;
      if (!studentId || !examId) return sendError(res, 400, 'Missing studentId or examId');
      if (!files.recording) return sendError(res, 400, 'Missing recording file');

      const studentDir = path.join(RECORDINGS_DIR, studentId);
      if (!fs.existsSync(studentDir)) fs.mkdirSync(studentDir, { recursive: true });

      const timestamp = Date.now();
      const filename = `${examId}_${timestamp}.webm`;
      const filePath = path.join(studentDir, filename);
      fs.writeFileSync(filePath, files.recording.data);
      const sizeKB = Math.round(files.recording.data.length / 1024);
      const serverUrl = `/api/recordings/file?studentId=${encodeURIComponent(studentId)}&filename=${encodeURIComponent(filename)}`;

      // Standalone Audio Support
      let audioFilename = null;
      let audioUrl = null;
      let audioSizeKB = 0;
      if (files.audio) {
        audioFilename = `${examId}_${timestamp}.audio.webm`;
        const audioPath = path.join(studentDir, audioFilename);
        fs.writeFileSync(audioPath, files.audio.data);
        audioSizeKB = Math.round(files.audio.data.length / 1024);
        audioUrl = `/api/recordings/file?studentId=${encodeURIComponent(studentId)}&filename=${encodeURIComponent(audioFilename)}`;
      }

      // Save metadata JSON alongside video
      const metaPath = path.join(studentDir, `${examId}_${timestamp}.json`);
      fs.writeFileSync(metaPath, JSON.stringify({
        studentId, examId, studentName, examTitle,
        filename, sizeKB, serverUrl,
        audioFilename, audioUrl, audioSizeKB,
        recordedAt: new Date().toISOString(),
      }));

      console.log(`[NEXA] Recording saved: ${filePath} (${sizeKB} KB)${audioFilename ? ` + Audio: ${audioFilename}` : ''}`);
      sendJSON(res, 200, { success: true, filename, serverUrl, audioUrl, sizeKB });
    } catch (err) {
      console.error('[NEXA] Upload error:', err);
      sendError(res, 500, err.message);
    }
  });
  req.on('error', err => sendError(res, 500, err.message));
}

// GET /api/recordings/list?studentId=X  OR  ?examId=X  OR  ?all=1
function handleList(req, res) {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const studentId = urlObj.searchParams.get('studentId');
  const examId = urlObj.searchParams.get('examId');

  const results = [];

  try {
    if (studentId) {
      // List recordings for a specific student
      const studentDir = path.join(RECORDINGS_DIR, studentId);
      if (fs.existsSync(studentDir)) {
        fs.readdirSync(studentDir)
          .filter(f => f.endsWith('.json'))
          .forEach(f => {
            try {
              const meta = JSON.parse(fs.readFileSync(path.join(studentDir, f), 'utf8'));
              results.push(meta);
            } catch (_) {}
          });
      }
    } else if (examId) {
      // List recordings for a specific exam (across all students)
      if (fs.existsSync(RECORDINGS_DIR)) {
        fs.readdirSync(RECORDINGS_DIR).forEach(sid => {
          const studentDir = path.join(RECORDINGS_DIR, sid);
          if (!fs.statSync(studentDir).isDirectory()) return;
          fs.readdirSync(studentDir)
            .filter(f => f.startsWith(examId) && f.endsWith('.json'))
            .forEach(f => {
              try {
                const meta = JSON.parse(fs.readFileSync(path.join(studentDir, f), 'utf8'));
                results.push(meta);
              } catch (_) {}
            });
        });
      }
    } else {
      // List all recordings
      if (fs.existsSync(RECORDINGS_DIR)) {
        fs.readdirSync(RECORDINGS_DIR).forEach(sid => {
          const studentDir = path.join(RECORDINGS_DIR, sid);
          if (!fs.statSync(studentDir).isDirectory()) return;
          fs.readdirSync(studentDir)
            .filter(f => f.endsWith('.json'))
            .forEach(f => {
              try {
                const meta = JSON.parse(fs.readFileSync(path.join(studentDir, f), 'utf8'));
                results.push(meta);
              } catch (_) {}
            });
        });
      }
    }

    results.sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
    sendJSON(res, 200, { success: true, recordings: results });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

// GET /api/recordings/file?studentId=X&filename=Y
function handleServeFile(req, res) {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const studentId = urlObj.searchParams.get('studentId');
  const filename = urlObj.searchParams.get('filename');

  if (!studentId || !filename) return sendError(res, 400, 'Missing studentId or filename');

  // Security: prevent path traversal
  const safe = path.basename(filename);
  if (safe !== filename) return sendError(res, 400, 'Invalid filename');

  const filePath = path.join(RECORDINGS_DIR, studentId, safe);
  if (!fs.existsSync(filePath)) return sendError(res, 404, 'Recording not found');

  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  const ext = path.extname(filename).toLowerCase();
  const mime = ext === '.webm' && filename.includes('.audio') ? 'audio/webm' : (MIME_TYPES[ext] || 'video/webm');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    if (start >= stat.size) return sendError(res, 416, 'Requested Range Not Satisfiable');
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mime,
      'Access-Control-Allow-Origin': '*',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': mime,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

// ─── Email API Handlers ───────────────────────────────────────

// Helper: parse JSON body from POST request
function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

// POST /api/email/send-otp  { email, name }
async function handleSendOTP(req, res) {
  try {
    const body = await parseJSONBody(req);
    const { email, name } = body;
    if (!email) return sendError(res, 400, 'Email is required');

    const otp = generateOTP();
    storeOTP(email, otp);

    const html = getEmailTemplate('otp', { name: name || 'User', otp });
    const result = await sendEmail(email, '🔐 NEXA — Password Reset OTP', html);

    if (result.mock) {
      // In mock mode, return OTP for frontend dev/testing
      console.log(`[OTP-MOCK] Email: ${email} | OTP: ${otp}`);
      sendJSON(res, 200, { success: true, mock: true, otp, message: 'OTP generated (SMTP offline — shown for testing)' });
    } else if (result.success) {
      sendJSON(res, 200, { success: true, message: 'OTP sent to your email' });
    } else {
      sendError(res, 500, 'Failed to send OTP email: ' + result.error);
    }
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

// POST /api/email/verify-otp  { email, otp }
async function handleVerifyOTP(req, res) {
  try {
    const body = await parseJSONBody(req);
    const { email, otp } = body;
    if (!email || !otp) return sendError(res, 400, 'Email and OTP are required');

    const result = verifyOTP(email, otp);
    if (result.valid) {
      sendJSON(res, 200, { success: true, verified: true, message: 'OTP verified successfully' });
    } else {
      sendJSON(res, 200, { success: true, verified: false, message: result.error });
    }
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

// POST /api/email/welcome  { email, name, role }
async function handleWelcomeEmail(req, res) {
  try {
    const body = await parseJSONBody(req);
    const { email, name, role } = body;
    if (!email || !name) return sendError(res, 400, 'Email and name are required');

    const html = getEmailTemplate('welcome', { name, email, role: role || 'Student' });
    const result = await sendEmail(email, '🎓 Welcome to NEXA Exam System!', html);

    sendJSON(res, 200, { success: true, mock: result.mock || false, message: 'Welcome email sent' });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

// POST /api/email/notify  { email, name, subject, message }
async function handleNotifyEmail(req, res) {
  try {
    const body = await parseJSONBody(req);
    const { email, name, subject, message } = body;
    if (!email || !message) return sendError(res, 400, 'Email and message are required');

    const html = getEmailTemplate('notification', { name, subject, message });
    const result = await sendEmail(email, subject || '📢 NEXA Notification', html);

    sendJSON(res, 200, { success: true, mock: result.mock || false, message: 'Notification sent' });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

// ─── Main Server ──────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }

  const urlPath = req.url.split('?')[0];

  // ── API Routes ──
  if (req.method === 'POST' && urlPath === '/api/upload-recording') return handleUpload(req, res);
  if (req.method === 'GET'  && urlPath === '/api/recordings/list')   return handleList(req, res);
  if (req.method === 'GET'  && urlPath === '/api/recordings/file')   return handleServeFile(req, res);

  // ── Cloud Sync Routes ──
  if (req.method === 'GET'  && urlPath === '/api/cloud-sync') {
    return sendJSON(res, 200, { success: true, data: cloudDatabase });
  }

  if (req.method === 'POST' && urlPath === '/api/cloud-sync') {
    return parseJSONBody(req).then(body => {
      const { key, data } = body;
      if (!key) return sendError(res, 400, 'Missing key');
      cloudDatabase[key] = data;
      saveDatabase();
      console.log(`☁️ Cloud Sync: Updated ${key}`);
      sendJSON(res, 200, { success: true, message: `Synced ${key}` });
    }).catch(err => sendError(res, 400, err.message));
  }

  // ── Email API Routes ──
  if (req.method === 'POST' && urlPath === '/api/email/send-otp')    return handleSendOTP(req, res);
  if (req.method === 'POST' && urlPath === '/api/email/verify-otp')  return handleVerifyOTP(req, res);
  if (req.method === 'POST' && urlPath === '/api/email/welcome')     return handleWelcomeEmail(req, res);
  if (req.method === 'POST' && urlPath === '/api/email/notify')      return handleNotifyEmail(req, res);
  if (req.method === 'GET'  && urlPath === '/api/email/status')      return sendJSON(res, 200, { success: true, smtpReady, configured: !!emailTransporter });

  // ── Static Files (Serve from ../frontend) ──
  let relativePath = urlPath === '/' ? '/index.html' : urlPath;
  let filePath = path.join(__dirname, '..', 'frontend', relativePath);

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('Server error: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });

});

server.listen(PORT, () => {
  console.log(`🚀 NEXA Server running at http://localhost:${PORT}/`);
  console.log(`📁 Recordings stored in: ${RECORDINGS_DIR}`);
});
