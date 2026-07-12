// ============================================================
// NEXA Auth — Login, Register, Forgot Password, Google Login
// ============================================================

// Separate captcha instances per form using factory pattern
function createCaptchaInstance() {
  return {
    current: null,
    generate() {
      const ops = [
        { symbol: '+', fn: (a, b) => a + b },
        { symbol: '−', fn: (a, b) => a - b },
        { symbol: '×', fn: (a, b) => a * b },
      ];
      const op = ops[Math.floor(Math.random() * ops.length)];
      let a, b;
      if (op.symbol === '×') {
        a = Math.floor(Math.random() * 12) + 2;
        b = Math.floor(Math.random() * 10) + 1;
      } else {
        a = Math.floor(Math.random() * 50) + 10;
        b = Math.floor(Math.random() * 30) + 5;
      }
      if (op.symbol === '−' && a < b) [a, b] = [b, a];
      this.current = {
        question: `${a} ${op.symbol} ${b}`,
        answer: op.fn(a, b),
      };
      return this.current.question;
    },
    verify(userAnswer) {
      return this.current && parseInt(userAnswer) === this.current.answer;
    },
  };
}
const captchas = { login: createCaptchaInstance(), register: createCaptchaInstance() };

// ─── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, we stay on the landing page/index page as per requirement.
  // The user can then click "Sign In" to see their role-specific dashboard via handleLogin or a separate "Go to Dashboard" button.
  /*
  if (Session.isLoggedIn()) {
    redirectToRole(Session.getRole());
    return;
  }
  */

  ThemeManager.init();
  refreshCaptcha('login');
  refreshCaptcha('register');
});

// ─── Tab Switching ─────────────────────────────────────────
function switchAuthTab(btn) {
  // Hide all forms
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));

  btn.classList.add('active');
  const formId = btn.dataset.form;
  document.getElementById(formId).classList.add('active');

  // Show main tabs
  document.getElementById('auth-main-tabs').style.display = 'flex';

  clearErrors();
}

function showForgotPassword() {
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById('auth-main-tabs').style.display = 'none';
  document.getElementById('forgot-form').classList.add('active');
  clearErrors();
}

function showLoginForm() {
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById('auth-main-tabs').style.display = 'flex';
  document.getElementById('login-form').classList.add('active');
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-form="login-form"]').classList.add('active');
  clearErrors();
}

function showResetForm() {
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById('auth-main-tabs').style.display = 'none';
  document.getElementById('reset-form').classList.add('active');
}

function showSuccess(title, message) {
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById('auth-main-tabs').style.display = 'none';
  document.getElementById('success-title').textContent = title;
  document.getElementById('success-message').textContent = message;
  document.getElementById('success-screen').classList.add('active');
}

// ─── CAPTCHA ───────────────────────────────────────────────
function refreshCaptcha(type) {
  const q = captchas[type].generate();
  document.getElementById(`${type}-captcha-question`).textContent = q;
  document.getElementById(`${type}-captcha-answer`).value = '';
}

// ─── Password Toggle ──────────────────────────────────────
function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

// ─── Password Strength ────────────────────────────────────
function updatePasswordStrength(value) {
  const container = document.getElementById('password-strength');
  if (!value) {
    container.className = 'password-strength';
    container.querySelector('.strength-text').textContent = '';
    return;
  }
  const strength = getPasswordStrength(value);
  const cls = getPasswordStrengthClass(value);
  container.className = `password-strength strength-${cls}`;
  container.querySelector('.strength-text').textContent = strength;
}

// ─── Error Helpers ─────────────────────────────────────────
function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.classList.add('show'); }
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(e => { e.textContent = ''; e.classList.remove('show'); });
  document.querySelectorAll('.form-control.error').forEach(e => e.classList.remove('error'));
}

// ─── LOGIN ─────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  clearErrors();

  const email = document.getElementById('login-email').value.replace(/\s+/g, '').toLowerCase();
  const password = document.getElementById('login-password').value;
  const captchaAns = document.getElementById('login-captcha-answer').value;

  let valid = true;

  if (!email) { showError('login-email-error', 'Email is required'); valid = false; }
  if (!password) { showError('login-password-error', 'Password is required'); valid = false; }

  if (!captchas.login.verify(captchaAns)) {
    showError('login-captcha-error', 'Incorrect CAPTCHA answer');
    refreshCaptcha('login');
    valid = false;
  }

  if (!valid) return;

  let user = UserDB.getByEmail(email);

  // If not found immediately, the cloud sync may still be settling (server cold-start).
  // Wait 2 s, trigger a fresh sync, then try again before showing an error.
  if (!user) {
    const btn = e.target.querySelector('button[type="submit"]');
    const origHTML = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...'; }

    await Sync.pullAll();
    user = UserDB.getByEmail(email);

    if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
  }

  if (!user) {
    showError('login-email-error', 'No account found with this email');
    return;
  }

  if (user.password !== password) {
    showError('login-password-error', 'Incorrect password');
    return;
  }

  // Success
  Session.set(user);
  showToast(`Welcome back, ${user.name}! 🎉`, 'success');
  setTimeout(() => redirectToRole(user.role), 800);
}

// ─── REGISTER ──────────────────────────────────────────────
function handleRegister(e) {
  e.preventDefault();
  clearErrors();

  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.replace(/\s+/g, '').toLowerCase();
  const password = document.getElementById('reg-password').value;
  const confirm = document.getElementById('reg-confirm').value;
  const role = document.querySelector('input[name="role"]:checked')?.value;
  const captchaAns = document.getElementById('register-captcha-answer').value;

  let valid = true;

  if (!name || name.length < 2) { showError('reg-name-error', 'Please enter your full name'); valid = false; }
  if (!email) { showError('reg-email-error', 'Email is required'); valid = false; }
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showError('reg-email-error', 'Please enter a valid email'); valid = false; }

  if (!password || password.length < 6) { showError('reg-password-error', 'Password must be at least 6 characters'); valid = false; }
  if (password !== confirm) { showError('reg-confirm-error', 'Passwords do not match'); valid = false; }

  if (!captchas.register.verify(captchaAns)) {
    showError('register-captcha-error', 'Incorrect CAPTCHA answer');
    refreshCaptcha('register');
    valid = false;
  }

  if (!valid) return;

  // Check if email already used
  if (UserDB.getByEmail(email)) {
    showError('reg-email-error', 'An account with this email already exists');
    return;
  }

  // Create user
  UserDB.create({ name, email, password, role });
  showToast('Account created successfully! 🎉', 'success');

  // Send welcome email (fire-and-forget)
  fetch(CONFIG.API_BASE_URL + '/api/email/welcome', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, role }),
  }).then(r => r.json()).then(data => {
    if (data.mock) {
      console.log('[NEXA] Welcome email sent (mock mode)');
    } else {
      console.log('[NEXA] Welcome email sent to', email);
    }
  }).catch(err => console.warn('[NEXA] Welcome email failed:', err));

  showSuccess('Account Created!', 'Your account has been created. Please sign in to continue.');
}

// ─── FORGOT PASSWORD (Browser-based OTP — no server needed) ───
let forgotEmail = '';
let otpVerified = false;

// Local OTP store — works even when server is offline
const localOTP = {
  code: null,
  expiry: null,
  attempts: 0,

  generate() {
    this.code = String(Math.floor(100000 + Math.random() * 900000));
    this.expiry = Date.now() + 5 * 60 * 1000; // 5 minutes
    this.attempts = 0;
    return this.code;
  },

  verify(input) {
    if (!this.code) return { valid: false, error: 'No OTP generated. Please request a new one.' };
    if (Date.now() > this.expiry) {
      this.code = null;
      return { valid: false, error: 'OTP has expired. Please request a new one.' };
    }
    this.attempts++;
    if (this.attempts > 5) {
      this.code = null;
      return { valid: false, error: 'Too many attempts. Please request a new OTP.' };
    }
    if (this.code !== input) {
      return { valid: false, error: `Incorrect OTP. ${5 - this.attempts} attempt(s) remaining.` };
    }
    this.code = null;
    return { valid: true };
  }
};

// Show the OTP on screen as a fallback when email is unavailable
function showOTPOnScreen(otp) {
  // Remove old banner if it exists
  const old = document.getElementById('otp-screen-display');
  if (old) old.remove();

  const box = document.createElement('div');
  box.id = 'otp-screen-display';
  box.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 99999; background: #1e1e2d; border: 2px solid #6C63FF;
    border-radius: 16px; padding: 32px 40px; text-align: center;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6); font-family: 'Inter', sans-serif;
    color: #e0e0e0; max-width: 360px; width: 90%;
  `;
  box.innerHTML = `
    <div style="font-size:2.5rem;margin-bottom:12px">📧</div>
    <h3 style="margin:0 0 8px;color:#fff;font-size:1.1rem">Email delivery unavailable</h3>
    <p style="font-size:13px;color:#888;margin:0 0 20px">The server is offline. Use this code to reset your password:</p>
    <div style="
      font-size: 2.2rem; font-weight: 800; letter-spacing: 10px;
      color: #6C63FF; background: rgba(108,99,255,0.1);
      border: 2px dashed #6C63FF; border-radius: 12px;
      padding: 16px; margin-bottom: 20px;
    ">${otp}</div>
    <p style="font-size:12px;color:#f59e0b;margin:0 0 20px">⏰ Valid for 5 minutes — do not close this window</p>
    <button onclick="document.getElementById('otp-screen-display').remove()" style="
      background:#6C63FF;color:#fff;border:none;border-radius:8px;
      padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;
    ">Got it — I wrote it down ✓</button>
  `;
  document.body.appendChild(box);
}

async function handleForgotPassword(e) {
  e.preventDefault();
  clearErrors();

  const email = document.getElementById('forgot-email').value.trim();

  if (!email) {
    showError('forgot-email-error', 'Please enter your email');
    return;
  }

  const user = UserDB.getByEmail(email);
  if (!user) {
    showError('forgot-email-error', 'No account found with this email');
    return;
  }

  forgotEmail = email;

  // Generate OTP locally — works 100% offline, no waiting for server
  const otp = localOTP.generate();

  // Show OTP form IMMEDIATELY — no spinner, no waiting
  showOTPForm();
  startResendTimer();
  showToast('📧 OTP generated! Sending to your email...', 'info');

  // Use Netlify function URL (never sleeps) — falls back to Render backend
  // /.netlify/functions/send-otp works automatically on Netlify-hosted sites
  const otpEndpoint = CONFIG.NETLIFY_URL
    ? CONFIG.NETLIFY_URL + '/.netlify/functions/send-otp'
    : '/.netlify/functions/send-otp';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  fetch(otpEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: user.name, otp }),
    signal: controller.signal,
  })
    .then(async r => {
      const isJson = r.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await r.json() : null;
      if (!r.ok) {
        throw new Error((data && data.error) || `HTTP error ${r.status}`);
      }
      return data;
    })
    .then(data => {
      clearTimeout(timeoutId);
      if (data.success && !data.mock) {
        showToast('✅ OTP sent to your email! Check your inbox.', 'success');
      } else if (data.mock) {
        console.warn('Netlify function run in mock mode:', data.reason);
        showToast('ℹ️ SMTP credentials missing on Netlify. Code shown on screen.', 'info', 6000);
        showOTPOnScreen(otp);
      } else {
        showToast('⚠️ OTP generated but could not email: ' + (data.error || 'Unknown error'), 'warning', 6000);
        showOTPOnScreen(otp);
      }
    })
    .catch(err => {
      clearTimeout(timeoutId);
      console.error('OTP send failed:', err);
      showToast('❌ Email send failed: ' + err.message, 'error', 8000);
      showOTPOnScreen(otp);
    });
}



// ─── OTP VERIFICATION ─────────────────────────────────────────
function showOTPForm() {
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById('auth-main-tabs').style.display = 'none';
  document.getElementById('otp-form').classList.add('active');
  // Focus first OTP input
  setTimeout(() => {
    const first = document.getElementById('otp-1');
    if (first) first.focus();
  }, 200);
}

function handleOTPInput(current, nextId) {
  current.value = current.value.replace(/\D/g, ''); // Allow only numbers
  if (current.value.length >= 1) {
    current.value = current.value.slice(-1); // Only keep last digit
    const next = document.getElementById(nextId);
    if (next) next.focus();
  }
}

function handleOTPKeydown(e, prevId) {
  if (e.key === 'Backspace' && !e.target.value) {
    const prev = document.getElementById(prevId);
    if (prev) { prev.focus(); prev.value = ''; }
  }
}

function handleOTPPaste(e) {
  e.preventDefault();
  const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById(`otp-${i + 1}`);
    if (el) el.value = paste[i] || '';
  }
  // Focus last filled
  const lastIdx = Math.min(paste.length, 6);
  const lastEl = document.getElementById(`otp-${lastIdx}`);
  if (lastEl) lastEl.focus();
}

async function verifyOTPCode(e) {
  e.preventDefault();
  const digits = [];
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById(`otp-${i}`);
    digits.push(el ? el.value : '');
  }
  const otp = digits.join('');
  if (otp.length !== 6) {
    showToast('Please enter the complete 6-digit OTP', 'error');
    return;
  }

  // Verify locally — no server call needed
  const result = localOTP.verify(otp);

  if (result.valid) {
    otpVerified = true;
    // Close on-screen display if open
    const display = document.getElementById('otp-screen-display');
    if (display) display.remove();
    showToast('✅ OTP verified! Set your new password.', 'success');
    showResetForm();
  } else {
    showToast('❌ ' + result.error, 'error');
  }
}

let resendCooldown = false;

function startResendTimer() {
  const btn = document.getElementById('resend-btn');
  const timer = document.getElementById('resend-timer');
  const counter = document.getElementById('otp-secs');
  if (!btn || !timer || !counter) return;

  resendCooldown = true;
  btn.style.display = 'none';
  timer.style.display = 'inline';
  
  let secs = 60;
  counter.textContent = secs;

  const interval = setInterval(() => {
    secs--;
    counter.textContent = secs;
    if (secs <= 0) {
      clearInterval(interval);
      resendCooldown = false;
      btn.style.display = 'inline';
      timer.style.display = 'none';
    }
  }, 1000);
}

async function resendOTP() {
  if (!forgotEmail || resendCooldown) return;
  const user = UserDB.getByEmail(forgotEmail);

  try {
    showToast('Resending OTP...', 'info');
    const res = await fetch(CONFIG.API_BASE_URL + '/api/email/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: forgotEmail, name: user?.name }),
    });
    const data = await res.json();
    if (data.success) {
      if (data.mock) {
        showToast(`📧 New OTP (test mode): ${data.otp}`, 'info', 15000);
      } else {
        showToast('📧 New OTP sent!', 'success');
      }
      startResendTimer();
    }
  } catch (err) {
    showToast('Failed to resend OTP', 'error');
  }
}

// ─── RESET PASSWORD ───────────────────────────────────────
function handleResetPassword(e) {
  e.preventDefault();

  if (!otpVerified) {
    showToast('Please verify OTP first', 'error');
    return;
  }

  const password = document.getElementById('reset-password').value;
  const confirm = document.getElementById('reset-confirm').value;

  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }

  if (password !== confirm) {
    showToast('Passwords do not match', 'error');
    return;
  }

  const user = UserDB.getByEmail(forgotEmail);
  if (user) {
    UserDB.update(user.id, { password });
    otpVerified = false;
    forgotEmail = '';
    showToast('Password reset successfully! 🎉', 'success');
    showSuccess('Password Reset!', 'Your password has been updated. Please sign in with your new password.');
  }
}

// Firebase references
let firebaseAuth = null;
let firebaseProvider = null;

// Dynamically initialize Firebase Auth if config is present
async function initFirebase() {
  if (!CONFIG.FIREBASE) return null;
  if (firebaseAuth) return firebaseAuth;

  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
    const { getAuth, GoogleAuthProvider } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");

    const app = initializeApp(CONFIG.FIREBASE);
    firebaseAuth = getAuth(app);
    firebaseProvider = new GoogleAuthProvider();
    return firebaseAuth;
  } catch (e) {
    console.error("Failed to initialize Firebase:", e);
    showToast("Firebase initialization failed", "error");
    return null;
  }
}

// Unified Google Login Success Handler
async function handleSuccessfulGoogleLogin(googleData) {
  // Check if user already exists
  let user = UserDB.getByEmail(googleData.email);
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    user = UserDB.create({
      name: googleData.name,
      email: googleData.email,
      password: 'google_oauth_secure_token',
      role: googleData.role || 'student'
    });
  } else {
    // Sync names/avatars if matched
    user = UserDB.update(user.id, {
      name: googleData.name,
      avatar: googleData.avatar || user.avatar
    });
  }

  if (isNewUser) {
    // Direct push to backend to guarantee the user is saved before page navigation
    await Sync.push(KEYS.USERS, UserDB.getAll());
  }

  Session.set(user);
  showToast(`Welcome back, ${user.name}! 🎉`, 'success');
  setTimeout(() => redirectToRole(user.role), 800);
}

// ─── GOOGLE LOGIN (Firebase Auth with Custom Simulator Fallback) ───
async function handleGoogleLogin() {
  if (CONFIG.FIREBASE) {
    showToast('Connecting to Google...', 'info');
    try {
      const authObj = await initFirebase();
      if (!authObj) {
        throw new Error("Could not initialize Firebase Auth.");
      }

      const { signInWithPopup } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
      const result = await signInWithPopup(authObj, firebaseProvider);
      const userObj = result.user;

      const googleData = {
        name: userObj.displayName || "Google User",
        email: userObj.email,
        avatar: userObj.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userObj.displayName)}&backgroundColor=6C63FF`,
        role: 'student' // Default role for new users
      };

      await handleSuccessfulGoogleLogin(googleData);
    } catch (error) {
      console.error("Firebase Google Auth failed:", error);
      showToast("Sign-In failed: " + error.message, "error");
    }
  } else {
    // Fall back to the simulated Google OAuth account chooser popup
    const width = 500;
    const height = 650;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    const popup = window.open(
      'google-login.html',
      'google_oauth',
      `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no,resizable=yes`
    );

    if (!popup) {
      showToast('Popup blocker detected. Please allow popups to sign in with Google.', 'warning');
    }
  }
}

// Global listener for the simulated Google login popup message
window.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'GOOGLE_LOGIN_SUCCESS') {
    await handleSuccessfulGoogleLogin(event.data.user);
  }
});

// ─── Role Redirect ─────────────────────────────────────────
function redirectToRole(role) {
  switch (role) {
    case 'admin': window.location.href = 'admin.html'; break;
    case 'question_manager': window.location.href = 'question-manager.html'; break;
    default: window.location.href = 'student.html'; break;
  }
}
