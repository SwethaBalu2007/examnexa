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
function handleLogin(e) {
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

  const user = UserDB.getByEmail(email);
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

// ─── FORGOT PASSWORD (Server-side OTP) ────────────────────────
let forgotEmail = '';
let otpVerified = false;

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

  // Show loading state
  const btn = e.target.querySelector('button[type="submit"]');
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending OTP...';

  try {
    const res = await fetch(CONFIG.API_BASE_URL + '/api/email/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: user.name }),
    });
    const data = await res.json();

    if (data.success) {
      if (data.mock) {
        // In offline mode, show OTP in a toast for testing
        showToast(`📧 OTP (test mode): ${data.otp}`, 'info', 15000);
      } else {
        showToast('📧 OTP sent to your email!', 'success');
      }
      showOTPForm();
    } else {
      showToast('❌ ' + (data.error || 'Failed to send OTP'), 'error');
    }
  } catch (err) {
    showToast('❌ Server error. Please try again.', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
  }
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

  const btn = e.target.querySelector('button[type="submit"]');
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';

  try {
    const res = await fetch(CONFIG.API_BASE_URL + '/api/email/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: forgotEmail, otp }),
    });
    const data = await res.json();

    if (data.verified) {
      otpVerified = true;
      showToast('✅ OTP verified! Set your new password.', 'success');
      showResetForm();
    } else {
      showToast('❌ ' + (data.message || 'Invalid OTP'), 'error');
    }
  } catch (err) {
    showToast('❌ Verification failed. Try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
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

// ─── GOOGLE LOGIN (Mock) ──────────────────────────────────
function handleGoogleLogin() {
  showToast('Connecting to Google...', 'info');

  // Simulate OAuth delay
  setTimeout(() => {
    // Check if demo google user exists
    let googleUser = UserDB.getByEmail('google.user@gmail.com');
    if (!googleUser) {
      googleUser = UserDB.create({
        name: 'Google User',
        email: 'google.user@gmail.com',
        password: 'google_oauth',
        role: 'student',
      });
    }

    Session.set(googleUser);
    showToast(`Welcome, ${googleUser.name}! 🎉`, 'success');
    setTimeout(() => redirectToRole(googleUser.role), 800);
  }, 1500);
}

// ─── Role Redirect ─────────────────────────────────────────
function redirectToRole(role) {
  switch (role) {
    case 'admin': window.location.href = 'admin.html'; break;
    case 'question_manager': window.location.href = 'question-manager.html'; break;
    default: window.location.href = 'student.html'; break;
  }
}
