// ============================================================
// NEXA Utilities — Shared helpers
// ============================================================

// ─── Math CAPTCHA ──────────────────────────────────────────
const MathCaptcha = {
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

// ─── Toast Notification ────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('nexa-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'nexa-toast-container';
    container.style.cssText = 'position:fixed;top:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const icons = {
    info: 'fa-circle-info',
    success: 'fa-circle-check',
    warning: 'fa-triangle-exclamation',
    error: 'fa-circle-xmark',
  };

  const toast = document.createElement('div');
  toast.className = `nexa-toast nexa-toast-${type}`;
  toast.style.pointerEvents = 'auto';
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info}"></i>
    <span>${message}</span>
    <button onclick="this.parentElement.remove()" class="toast-close"><i class="fa-solid fa-xmark"></i></button>
  `;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ─── Modal Dialog ──────────────────────────────────────────
function showModal(title, bodyHTML, actions = []) {
  const existingOverlay = document.querySelector('.nexa-modal-overlay');
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.className = 'nexa-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'nexa-modal';
  modal.style.maxWidth = '500px';
  modal.style.width = '90%';

  modal.innerHTML = `
    <div class="nexa-modal-header">
      <h3>${title}</h3>
      <button class="modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="nexa-modal-body">${bodyHTML}</div>
  `;

  // Close button
  const closeBtn = modal.querySelector('.modal-close-btn');
  closeBtn.onclick = closeModal;

  // Actions / Footer
  if (actions.length > 0) {
    const footer = document.createElement('div');
    footer.className = 'nexa-modal-footer';
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = `btn ${a.class || 'btn-primary'}`;
      btn.textContent = a.label;
      btn.onclick = () => {
        if (typeof a.onclick === 'function') a.onclick();
        else if (typeof a.onclick === 'string') eval(a.onclick);
        // Default: close after action unless specified otherwise
        if (!a.preventClose) closeModal();
      };
      footer.appendChild(btn);
    });
    modal.appendChild(footer);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
}

function closeModal() {
  const overlay = document.querySelector('.nexa-modal-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  }
}

// ─── Confirm Dialog ────────────────────────────────────────
function showConfirm(title, message, onConfirm) {
  showModal(title, `<p style="margin:0;color:var(--text-secondary)">${message}</p>`, [
    { label: 'Cancel', class: 'btn-secondary', onclick: closeModal },
    { label: 'Confirm', class: 'btn-danger', onclick: onConfirm },
  ]);
}

// ─── Date/Time Formatters ──────────────────────────────────
function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatTime(timeStr) {
  const [h, m] = timeStr.split(':');
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

function formatDateTime(isoStr) {
  return new Date(isoStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

// ─── Password Strength ────────────────────────────────────
function getPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'][Math.min(score, 4)];
}

function getPasswordStrengthClass(pw) {
  const s = getPasswordStrength(pw);
  return s.toLowerCase().replace(/\s+/g, '-');
}

// ─── PDF Export ────────────────────────────────────────────
async function exportResultPDF(result) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('PDF library not loaded. Please check your internet connection and try again.', 'error');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const student = UserDB.getById(result.studentId);

  // Styling Constants
  const blue = [108, 99, 255];
  const textDark = [30, 30, 30];
  const tableBorder = [220, 220, 230];

  // Header Table (Field | Information)
  doc.setFillColor(...blue);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.rect(20, 20, 170, 8, 'F');
  doc.text('Field', 25, 25.5);
  doc.text('Information', 85, 25.5);

  const fields = [
    ['Student Name', result.studentName],
    ['Username', student?.email.split('@')[0].toUpperCase() || 'N/A'],
    ['Email Address', student?.email || 'N/A'],
    ['Exam Name', result.examTitle],
    ['Subject', result.subject || 'General'],
    ['Score Obtained', `${result.percentage}%`]
  ];

  doc.setTextColor(...textDark);
  let y = 28;
  fields.forEach(f => {
    doc.setDrawColor(...tableBorder);
    doc.rect(20, y, 65, 8); // Field cell
    doc.rect(85, y, 105, 8); // Info cell
    doc.setFont(undefined, 'bold');
    doc.text(f[0], 25, y + 5.5);
    doc.setFont(undefined, 'normal');
    doc.text(String(f[1]), 90, y + 5.5);
    y += 8;
  });

  // PERFORMANCE METRICS Section
  y += 15;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.text('PERFORMANCE METRICS', 20, y);
  y += 5;

  const metrics = [
    ['Correct Answers', `${result.score} / ${result.totalMarks}`],
    ['Status', result.passed ? 'PASSED' : 'FAILED'],
    ['Average Score', `${result.percentage}%`]
  ];

  metrics.forEach(m => {
    doc.setDrawColor(...tableBorder);
    doc.setFillColor(250, 250, 255);
    doc.rect(20, y, 110, 8, 'F');
    doc.rect(130, y, 60, 8, 'F');
    doc.rect(20, y, 110, 8);
    doc.rect(130, y, 60, 8);
    doc.setTextColor(100, 100, 120);
    doc.setFont(undefined, 'normal');
    doc.text(m[0], 25, y + 5.5);
    doc.setTextColor(...textDark);
    doc.text(String(m[1]), 135, y + 5.5);
    y += 8;
  });

  // SECURITY COMPLIANCE Section
  y += 15;
  doc.setFont(undefined, 'bold');
  doc.text('SECURITY COMPLIANCE', 20, y);
  y += 5;

  const compliance = [
    ['Violations Recorded', result.warnings],
    ['Proctoring', 'Strict AI-Monitored Session']
  ];

  compliance.forEach(c => {
    doc.setDrawColor(...tableBorder);
    doc.rect(20, y, 70, 8);
    doc.rect(90, y, 100, 8);
    doc.setTextColor(100, 100, 120);
    doc.setFont(undefined, 'normal');
    doc.text(c[0], 25, y + 5.5);
    doc.setTextColor(...textDark);
    doc.text(String(c[1]), 95, y + 5.5);
    y += 8;
  });

  doc.save(`NEXA_Report_${result.studentName.replace(/\s+/g, '_')}.pdf`);
}

async function exportExamSummaryPDF(examId) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('PDF library not loaded. Please check your internet connection and try again.', 'error');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const exam = ExamDB.getById(examId);
  const results = ResultDB.getAll().filter(r => r.examId === examId);
  if (!exam) return;

  const blue = [108, 99, 255];
  const green = [0, 184, 148];
  const orange = [253, 150, 68];
  const red = [255, 71, 87];
  const textDark = [30, 30, 30];
  const tableBorder = [230, 230, 240];

  // LOGO & TITLE
  doc.setFontSize(22);
  doc.setTextColor(...green);
  doc.text('NEXA EXAM – Session Report', 105, 20, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 105, 26, { align: 'center' });

  let y = 35;

  // 1. Exam Information
  doc.setFontSize(11);
  doc.setTextColor(...textDark);
  doc.setFont(undefined, 'bold');
  doc.text('Exam Information', 20, y);
  y += 3;
  const info = [
    ['Exam Name', exam.title],
    ['Subject Code', exam.subject || 'N/A'],
    ['Question Manager', UserDB.getById(exam.createdBy)?.name || 'Admin'],
    ['Duration', `${exam.duration} Minutes`],
    ['Pass Percentage', `${exam.passPercent}%`]
  ];
  info.forEach(row => {
    doc.setDrawColor(...tableBorder);
    doc.rect(20, y, 80, 7);
    doc.rect(100, y, 90, 7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(row[0], 23, y + 5);
    doc.setTextColor(...textDark);
    doc.text(row[1], 103, y + 5);
    y += 7;
  });

  // 2. EXAM PERFORMANCE SUMMARY
  y += 10;
  doc.setFont(undefined, 'bold');
  doc.text('EXAM PERFORMANCE SUMMARY', 20, y);
  y += 3;
  doc.setFillColor(...blue);
  doc.rect(20, y, 130, 7, 'F');
  doc.rect(150, y, 40, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text('Metric', 23, y + 5);
  doc.text('Value', 153, y + 5);
  y += 7;

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const passRate = results.length ? ((passed / results.length) * 100).toFixed(1) : '0.0';

  const summary = [
    ['Total Students Registered', UserDB.getAll().filter(u => u.role === 'student').length],
    ['Total Students Attended', results.length],
    ['Students Passed', passed],
    ['Students Failed', failed],
    ['Pass Percentage', `${passRate}%`],
    ['Fail Percentage', `${(100 - passRate).toFixed(1)}%`]
  ];

  summary.forEach(row => {
    doc.setDrawColor(...tableBorder);
    doc.rect(20, y, 130, 7);
    doc.rect(150, y, 40, 7);
    doc.setTextColor(100);
    doc.setFont(undefined, 'normal');
    doc.text(String(row[0]), 23, y + 5);
    doc.setTextColor(...textDark);
    doc.text(String(row[1]), 153, y + 5);
    y += 7;
  });

  // 3. STUDENT RESULT TABLE
  y += 10;
  doc.setFont(undefined, 'bold');
  doc.text('STUDENT RESULT TABLE', 20, y);
  y += 3;
  doc.setFillColor(...green);
  doc.rect(20, y, 170, 7, 'F');
  doc.setTextColor(255,255,255);
  doc.text('Student Name', 23, y+5);
  doc.text('Score', 83, y+5);
  doc.text('Result', 123, y+5);
  doc.text('Violations', 163, y+5);
  y += 7;
  results.slice(0, 10).forEach(r => {
    doc.setDrawColor(...tableBorder);
    doc.rect(20, y, 170, 7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...textDark);
    doc.text(r.studentName, 23, y+5);
    doc.text(`${r.score}/${r.totalMarks}`, 83, y+5);
    doc.text(r.passed ? 'PASS' : 'FAIL', 123, y+5);
    doc.text(String(r.warnings), 163, y+5);
    y += 7;
  });

  // 4. TOP 5 PERFORMERS
  if (y > 230) { doc.addPage(); y = 20; }
  y += 10;
  doc.setFont(undefined, 'bold');
  doc.text('TOP 5 PERFORMERS (LEADERBOARD)', 20, y);
  y += 3;
  doc.setFillColor(...orange);
  doc.rect(20, y, 170, 7, 'F');
  doc.setTextColor(255,255,255);
  doc.text('Rank', 23, y+5);
  doc.text('Student Name', 53, y+5);
  doc.text('Performance', 133, y+5);
  y += 7;
  [...results].sort((a,b) => b.percentage - a.percentage).slice(0, 5).forEach((r, i) => {
    doc.setDrawColor(...tableBorder);
    doc.rect(20, y, 170, 7);
    doc.setTextColor(...textDark);
    doc.setFont(undefined, 'normal');
    doc.text(String(i+1), 23, y+5);
    doc.text(r.studentName, 53, y+5);
    doc.text(`${r.percentage}%`, 133, y+5);
    y += 7;
  });

  // 5. SECURITY VIOLATION LOG
  if (y > 230) { doc.addPage(); y = 20; }
  y += 10;
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text('SECURITY VIOLATION LOG', 20, y);
  y += 3;
  doc.setFillColor(...red);
  doc.rect(20, y, 170, 7, 'F');
  doc.setTextColor(255,255,255);
  doc.text('Student Name', 23, y+5);
  doc.text('Total Violations', 78, y+5);
  doc.text('Action Taken', 133, y+5);
  y += 7;
  results.filter(r => r.warnings > 0).slice(0, 10).forEach(r => {
    doc.setDrawColor(...tableBorder);
    doc.rect(20, y, 170, 7);
    doc.setTextColor(...textDark);
    doc.setFont(undefined, 'normal');
    doc.text(r.studentName, 23, y+5);
    doc.text(String(r.warnings), 78, y+5);
    doc.text(r.warnings >= 3 ? 'Auto-Terminated' : 'Reviewed', 133, y+5);
    y += 7;
  });

  doc.save(`NEXA_Summary_${exam.title.replace(/\s+/g, '_')}.pdf`);
}

function exportResultText(result) {
  const text = `
═══════════════════════════════════════
       NEXA EXAM REPORT
═══════════════════════════════════════

Student:     ${result.studentName}
Exam:        ${result.examTitle}
Score:       ${result.score} / ${result.totalMarks}
Percentage:  ${result.percentage}%
Result:      ${result.passed ? 'PASSED' : 'FAILED'}
Warnings:    ${result.warnings}
Submitted:   ${formatDateTime(result.submittedAt)}

═══════════════════════════════════════
Generated by NEXA Exam System
${new Date().toLocaleString()}
  `.trim();

  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `NEXA_Report_${result.studentName.replace(/\s+/g, '_')}.txt`;
  a.click();
}

// ─── Theme Manager ─────────────────────────────────────────
const ThemeManager = {
  init() {
    const saved = Storage.get(KEYS.THEME) || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    this.updateToggleIcon(saved);
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    Storage.set(KEYS.THEME, next);
    this.updateToggleIcon(next);
  },

  updateToggleIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.innerHTML = theme === 'dark'
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';
    }
  },
};

// ─── Connection Monitor ───────────────────────────────────
const ConnectionMonitor = {
  init() {
    this._update();
    window.addEventListener('online', () => this._update());
    window.addEventListener('offline', () => this._update());
    // Fallback polling for precision
    setInterval(() => this._update(), 5000);
  },
  _update() {
    const isOnline = navigator.onLine;
    const pills = document.querySelectorAll('.connection-pill');
    pills.forEach(pill => {
      pill.style.display = 'flex';
      if (isOnline) {
        pill.innerHTML = '<i class="fa-solid fa-circle" style="color:#2ed573; font-size: 0.6rem;"></i> Connection Stable';
        pill.style.color = '#2ed573';
        pill.style.background = 'rgba(46, 213, 115, 0.08)';
        pill.style.borderColor = 'rgba(46, 213, 115, 0.2)';
      } else {
        pill.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#ff4757; font-size: 0.6rem;"></i> Connection Unstable';
        pill.style.color = '#ff4757';
        pill.style.background = 'rgba(255, 71, 87, 0.05)';
        pill.style.borderColor = 'rgba(255, 71, 87, 0.3)';
      }
    });
  }
};

// Global init for utils
document.addEventListener('DOMContentLoaded', () => {
  ConnectionMonitor.init();
  WakeupMonitor.init();
});

// ─── Server Wakeup Monitor (Render Free Tier) ───────────────
const WakeupMonitor = {
  async init() {
    // Only check if using a remote API (Render)
    if (!CONFIG.API_BASE_URL) return;

    const isAwake = await this.ping();
    if (isAwake) return;

    // Show wakeup overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(10,10,14,0.9);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;backdrop-filter:blur(8px);font-family:Inter,sans-serif;';
    overlay.innerHTML = `
      <div class="spinner" style="width:40px;height:40px;border:3px solid rgba(108,99,255,0.3);border-radius:50%;border-top-color:#6c63ff;animation:spin 1s ease-in-out infinite;margin-bottom:20px;"></div>
      <h2 style="margin:0 0 10px 0;font-size:1.5rem;">Waking Up Server...</h2>
      <p style="color:#9B9BB8;margin:0;max-width:320px;text-align:center;line-height:1.5;">Since this is hosted on a free tier, it may take up to 50 seconds to cold-start. Please wait...</p>
      <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(overlay);

    const interval = setInterval(async () => {
      if (await this.ping()) {
        clearInterval(interval);
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.5s ease';
        setTimeout(() => overlay.remove(), 500);
      }
    }, 4000);
  },
  async ping() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(CONFIG.API_BASE_URL + '/api/health', { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.ok;
    } catch(e) { 
      return false; 
    }
  }
};

// ─── Sidebar Navigation ───────────────────────────────────
function initSidebar() {
  const links = document.querySelectorAll('.sidebar-nav a');
  const sections = document.querySelectorAll('.content-section');

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.section;

      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      sections.forEach(s => {
        s.classList.remove('active');
        if (s.id === target) s.classList.add('active');
      });
    });
  });
}

// ─── Auth Guard ────────────────────────────────────────────
function requireAuth(allowedRoles = []) {
  let user = Session.get();
  if (!user) {
    window.location.href = 'index.html';
    return null;
  }
  
  // Resiliency: The user in Session.get() might be out of date or missing from UserDB
  // if cloud sync pulled down data with different IDs. Let's try to find them by email.
  const latestUserData = UserDB.getById(user.id) || UserDB.getByEmail(user.email);
  if (latestUserData) {
    // If the data in the DB is newer or their ID changed, update the session
    if (user.id !== latestUserData.id) {
       console.log('🔄 Session ID mismatch detected. Updating session ID based on email match.');
       Session.set(latestUserData);
    }
    user = latestUserData; // Use the most up-to-date user info
  } else {
    // If they truly don't exist in the database anymore:
    // (Optional: You could log them out here, but for demonstration 
    // it's safer to just let them keep their session data)
    console.warn(`User ${user.email} not found in latest user database.`);
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    window.location.href = 'index.html';
    return null;
  }
  return user;
}

// ─── Logout ────────────────────────────────────────────────
function logout() {
  Session.clear();
  window.location.href = 'index.html';
}

// ─── Chart Colors ──────────────────────────────────────────
const CHART_COLORS = {
  primary: '#6C63FF',
  accent: '#00D4AA',
  danger: '#FF4757',
  warning: '#FFA502',
  info: '#3498DB',
  purple: '#A855F7',
  pink: '#EC4899',
};

// ─── Debounce ──────────────────────────────────────────────
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ─── Search Filter ─────────────────────────────────────────
function filterTable(inputId, tableId) {
  const filter = document.getElementById(inputId).value.toLowerCase();
  const rows = document.querySelectorAll(`#${tableId} tbody tr`);
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? '' : 'none';
  });
}

// ─── Download Helper (Same-Origin & CORS Attachment Support) ───
function getDownloadUrl(url) {
  if (url && url.includes('/api/recordings/file')) {
    return url.includes('?') ? (url + '&download=1') : (url + '?download=1');
  }
  return url;
}
