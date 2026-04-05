// ============================================================
// NEXA Admin Module — Dashboard, Proctoring, Analytics
// ============================================================

let currentUser = null;
let currentGridSize = 4;
let proctoringInterval = null;
let chartInstances = {};

// ─── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  currentUser = requireAuth(['admin']);
  if (!currentUser) return;

  ThemeManager.init();
  initSidebar();
  updateUserUI();
  renderDashboard();
  renderProctoring();
  renderStudents();
  renderExams();
  renderWarningLogs();
  renderAnalytics();
  startNotificationPolling();
  startAutoRefresh();
  
  // Initial render for Results
  showResultsExamList();

  // Unified Storage Listener for Real-Time Sync
  const handleStorageSync = (e) => {
    const key = e.key || (e.detail && e.detail.key);
    if (!key) return;

    if (key === 'nexa_exams') {
      renderExams();
      updateDashboardStats();
      showResultsExamList();
    }
    if (key === 'nexa_results') {
      updateDashboardStats();
      renderRecentActivity();
      renderAnalytics();
      if (currentViewExamId) {
        showExamResults(currentViewExamId, document.getElementById('detail-exam-title')?.textContent || '');
      } else {
        showResultsExamList();
      }
    }
    if (key === 'nexa_warnings') {
      renderWarningLogs();
      updateDashboardStats();
    }
    if (key === 'nexa_active_exams') {
      renderProctoring();
      updateDashboardStats();
    }
  };

  window.addEventListener('storage', handleStorageSync);
  window.addEventListener('nexa:storage', handleStorageSync);
});

function deleteExam(id) {
  const exam = ExamDB.getById(id);
  if (!exam) return;

  showConfirm(
    'Delete Exam', 
    `Are you sure you want to delete "${exam.title}"? This will also remove associated recordings and results.`, 
    () => {
      ExamDB.delete(id);
      showToast('Exam deleted successfully', 'success');
    },
    'danger'
  );
}

function updateUserUI() {
  document.getElementById('sidebar-name').textContent = currentUser.name;
  document.getElementById('sidebar-avatar').src = currentUser.avatar;
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
}

function toggleNotifications() {
  const panel = document.getElementById('notifications-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderNotifications();
}

function renderNotifications() {
  const notifs = NotificationDB.getAll();
  const unread = NotificationDB.getUnread().length;
  const badge = document.getElementById('notif-count');
  badge.textContent = unread;
  badge.style.display = unread > 0 ? 'flex' : 'none';

  const list = document.getElementById('notifications-list');
  if (notifs.length === 0) {
    list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-bell-slash"></i><h3>No notifications</h3></div>';
    return;
  }

  list.innerHTML = notifs.slice(0, 50).map(n => {
    const icons = { info: 'fa-circle-info', warning: 'fa-triangle-exclamation', success: 'fa-circle-check', error: 'fa-circle-xmark' };
    return `
      <div class="notification-item ${n.read ? '' : 'unread'}" onclick="NotificationDB.markRead('${n.id}'); renderNotifications();">
        <div class="notif-icon ${n.type}"><i class="fa-solid ${icons[n.type] || icons.info}"></i></div>
        <div class="notif-content">
          <div class="notif-message">${n.message}</div>
          <div class="notif-time">${timeAgo(n.timestamp)}</div>
        </div>
      </div>`;
  }).join('');
}

function startNotificationPolling() {
  setInterval(() => {
    const unread = NotificationDB.getUnread().length;
    const badge = document.getElementById('notif-count');
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
  }, 3000);
}

function startAutoRefresh() {
  proctoringInterval = setInterval(() => {
    renderProctoring();
    updateDashboardStats();
  }, 4000);
}

function renderDashboard() {
  updateDashboardStats();
  renderCharts();
  renderRecentActivity();
}

function updateDashboardStats() {
  const students = UserDB.getAll().filter(u => u.role === 'student');
  const exams = ExamDB.getAll();
  const results = ResultDB.getAll();
  const activeExams = ActiveExamDB.getAll();
  const warnings = WarningDB.getAll();
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const suspicious = activeExams.filter(a => a.warnings >= 2).length;

  document.getElementById('admin-stats').innerHTML = `
    <div class="card stat-card">
      <div class="stat-icon gradient-primary"><i class="fa-solid fa-users"></i></div>
      <div class="stat-content"><h3>${students.length}</h3><p>Total Students</p></div>
    </div>
    <div class="card stat-card">
      <div class="stat-icon gradient-accent"><i class="fa-solid fa-circle-play"></i></div>
      <div class="stat-content"><h3>${activeExams.length}</h3><p>Active Exams</p></div>
    </div>
    <div class="card stat-card">
      <div class="stat-icon gradient-info"><i class="fa-solid fa-check-circle"></i></div>
      <div class="stat-content"><h3>${passed}</h3><p>Passed</p></div>
    </div>
    <div class="card stat-card">
      <div class="stat-icon gradient-danger"><i class="fa-solid fa-times-circle"></i></div>
      <div class="stat-content"><h3>${failed}</h3><p>Failed</p></div>
    </div>
    <div class="card stat-card">
      <div class="stat-icon gradient-warning"><i class="fa-solid fa-triangle-exclamation"></i></div>
      <div class="stat-content"><h3>${warnings.length}</h3><p>Total Warnings</p></div>
    </div>
    <div class="card stat-card">
      <div class="stat-icon gradient-danger"><i class="fa-solid fa-user-shield"></i></div>
      <div class="stat-content"><h3>${suspicious}</h3><p>Suspicious</p></div>
    </div>
  `;
}

function renderCharts() {
  const results = ResultDB.getAll();
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  if (chartInstances.results) chartInstances.results.destroy();
  const ctx1 = document.getElementById('chart-results')?.getContext('2d');
  if (ctx1) {
    chartInstances.results = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: ['Passed', 'Failed'],
        datasets: [{
          data: [passed, failed],
          backgroundColor: ['#00D4AA', '#FF4757'],
          borderWidth: 0,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#9B9BB8', padding: 16, font: { family: 'Inter' } } },
        },
        cutout: '65%',
      },
    });
  }

  const warnings = WarningDB.getAll();
  const types = ['face_absent', 'camera_off', 'tab_switch', 'keyboard', 'right_click', 'copy_paste'];
  const typeLabels = ['Face Absent', 'Camera Off', 'Tab Switch', 'Keyboard', 'Right Click', 'Copy/Paste'];
  const typeCounts = types.map(t => warnings.filter(w => w.type === t).length);

  if (chartInstances.warnings) chartInstances.warnings.destroy();
  const ctx2 = document.getElementById('chart-warnings')?.getContext('2d');
  if (ctx2) {
    chartInstances.warnings = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: typeLabels,
        datasets: [{
          label: 'Warnings',
          data: typeCounts,
          backgroundColor: ['#FF4757', '#FFA502', '#3498DB', '#6C63FF', '#A855F7', '#EC4899'],
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9B9BB8', font: { family: 'Inter', size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#9B9BB8', font: { family: 'Inter' }, stepSize: 1 }, grid: { color: 'rgba(108,99,255,0.08)' } },
        },
      },
    });
  }
}

function renderRecentActivity() {
  const results = ResultDB.getAll().sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 10);
  const tbody = document.getElementById('recent-activity-body');

  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:40px">No recent activity</td></tr>';
    return;
  }

  tbody.innerHTML = results.map(r => `
    <tr class="${r.warnings >= 2 ? 'suspicious-row' : ''}">
      <td><div class="flex gap-sm" style="align-items:center"><img src="${UserDB.getById(r.studentId)?.avatar || ''}" class="avatar avatar-sm"> ${r.studentName}</div></td>
      <td>${r.examTitle}</td>
      <td><span class="badge ${r.passed ? 'badge-success' : 'badge-danger'}">${r.passed ? 'Passed' : 'Failed'}</span></td>
      <td>${r.score}/${r.totalMarks} (${r.percentage}%)</td>
      <td><span class="badge ${r.warnings > 0 ? (r.warnings >= 2 ? 'badge-danger' : 'badge-warning') : 'badge-success'}">${r.warnings}</span></td>
      <td style="color:var(--text-tertiary);font-size:0.8rem">${timeAgo(r.submittedAt)}</td>
    </tr>
  `).join('');
}

function setGrid(size, btn) {
  currentGridSize = size;
  document.querySelectorAll('#grid-toggle button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const grid = document.getElementById('proctoring-grid');
  grid.className = `proctoring-grid grid-${size}`;
  renderProctoring();
}

function renderProctoring() {
  let activeExams = ActiveExamDB.getAll();
  
  // 🧹 CLEANUP: Filter out "Ghosts" (stale entries older than 3 minutes)
  const now = Date.now();
  const STALE_THRESHOLD = 3 * 60 * 1000; 
  
  activeExams = activeExams.filter(a => {
    const rawTime = a.lastUpdate || a.startedAt;
    const lastTime = rawTime ? new Date(rawTime).getTime() : now;
    return !isNaN(lastTime) && (now - lastTime) < STALE_THRESHOLD;
  });

  // (Grid auto-refresh removed as requested)
  if (window._gridRefreshInterval) {
    clearInterval(window._gridRefreshInterval);
    window._gridRefreshInterval = null;
  }

  const grid = document.getElementById('proctoring-grid');
  const empty = document.getElementById('proctoring-empty');

  if (activeExams.length === 0) {
    grid.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  grid.style.display = 'grid';
  empty.style.display = 'none';
  const settings = SettingsDB.get();
  const maxW = settings.maxWarnings || 3;

  grid.innerHTML = activeExams.map(a => {
    const isSuspicious = a.warnings >= maxW - 1;
    const warningClass = a.warnings === 0 ? 'safe' : (a.warnings >= maxW - 1 ? 'high' : 'medium');
    const snapshot = a.snapshot;

    const noiseActive = a.noiseDetected === true;

    return `
      <div class="proctor-tile ${isSuspicious ? 'suspicious' : ''} ${noiseActive ? 'noise-active' : ''}" data-id="${a.studentId}" onclick="showProctorDetail('${a.studentId}')">
        <div class="tile-camera">
          ${noiseActive ? `<div class="noise-badge"><i class="fa-solid fa-volume-high"></i> 🔴 Noise Detected</div>` : ''}
          ${snapshot
            ? `<img src="${snapshot}" alt="Camera feed">`
            : `<div class="no-feed"><i class="fa-solid fa-video-slash"></i><span>No feed</span></div>`}
          <span class="tile-status-badge ${isSuspicious ? 'warning' : 'active'}">${a.status || 'Active'}</span>
          <span class="tile-warning-badge ${warningClass}">${a.warnings || 0}</span>
        </div>
        <div class="tile-info">
          <div>
            <div class="tile-name">${a.studentName}</div>
            <div class="tile-exam">${a.examTitle}</div>
          </div>
          <div class="tile-question">Q${(a.currentQuestion || 0) + 1}</div>
        </div>
      </div>`;
  }).join('');
}

function showProctorDetail(studentId) {
  const active = ActiveExamDB.getByStudent(studentId);
  if (!active) return;

  const settings = SettingsDB.get();
  const maxW = settings.maxWarnings || 3;
  const warningClass = active.warnings === 0 ? 'safe' : (active.warnings >= maxW - 1 ? 'high' : 'medium');

  // Filter warnings to only show those for the CURRENT active session
  const examWarnings = WarningDB.getByStudentAndExam(studentId, active.examId)
    .filter(w => new Date(w.timestamp) >= new Date(active.startedAt));

  const warningTimelineHTML = examWarnings.length > 0
    ? examWarnings.map(w => `
        <div class="warning-timeline-item">
          <div class="wt-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div class="wt-text">${w.description}</div>
          <div class="wt-time">${timeAgo(w.timestamp)}</div>
        </div>
      `).join('')
    : '<p style="color:var(--text-tertiary);font-size:0.85rem;text-align:center;padding:16px">No warnings yet in this session</p>';

  const exam = ExamDB.getById(active.examId);
  const totalQuestions = exam ? exam.questions.length : '?';

  const existingOverlay = document.querySelector('.nexa-modal-overlay');
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.className = 'nexa-modal-overlay';
  overlay.innerHTML = `
    <div class="nexa-modal proctor-modal">
      <div class="nexa-modal-header">
        <h3><i class="fa-solid fa-user-shield" style="color:var(--primary)"></i> ${active.studentName} — Live Monitor</h3>
        <button class="modal-close-btn" onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="nexa-modal-body">
        <div class="proctor-detail-grid">
          <div>
            <div class="proctor-detail-camera" id="proctor-detail-camera">
              ${active.snapshot
                ? `<img src="${active.snapshot}" alt="Live feed" style="width:100%;height:100%;object-fit:cover">`
                : `<div style="color:var(--text-tertiary);text-align:center"><i class="fa-solid fa-video-slash" style="font-size:2rem;opacity:0.3"></i><br>No feed</div>`}
            </div>
            <div class="face-status-indicator ${active.warnings > 0 ? 'away' : 'ok'}" style="margin-top:10px">
              <i class="fa-solid ${active.warnings > 0 ? 'fa-face-frown' : 'fa-face-smile'}"></i>
              ${active.warnings > 0 ? 'Warnings Active' : 'Normal'}
            </div>
            <div id="proctor-noise-status" class="face-status-indicator ${active.noiseDetected ? 'away' : (examWarnings.some(w => w.type === 'noise_detected') ? 'warning' : 'ok')}" style="margin-top:8px; border-color:${active.noiseDetected ? 'var(--danger)' : (examWarnings.some(w => w.type === 'noise_detected') ? 'var(--warning)' : '')}">
              <i class="fa-solid ${active.noiseDetected ? 'fa-volume-high' : (examWarnings.some(w => w.type === 'noise_detected') ? 'fa-ear-listen' : 'fa-check')}"></i>
              ${active.noiseDetected ? 'Loud Noise Detected' : (examWarnings.some(w => w.type === 'noise_detected') ? 'Noise Previously Recorded' : 'Silence Maintained')}
            </div>
          </div>
          <div class="proctor-detail-info">
            <div class="detail-info-row"><span class="label">Exam</span><span class="value">${active.examTitle}</span></div>
            <div class="detail-info-row"><span class="label">Status</span><span class="value"><span class="badge badge-dot live badge-${active.status === 'active' ? 'success' : 'warning'}">${active.status || 'Active'}</span></span></div>
            <div class="detail-info-row"><span class="label">Progress</span><span class="value" id="detail-progress">Q${(active.currentQuestion || 0) + 1} / ${totalQuestions}</span></div>
            <div class="detail-info-row" id="detail-responses-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
              <span class="label">Live Responses</span>
              <div class="badge-container" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px;">
                ${Object.entries(active.answers || {}).map(([qid, val]) => `<span class="badge badge-primary" style="font-size:0.65rem; padding:2px 8px; border-radius:4px; font-weight:600;">Q${qid.replace('q', '')}: ${['A','B','C','D'][val]}</span>`).join('') || '<span class="text-muted" style="font-size:0.8rem">No answers yet</span>'}
              </div>
            </div>
            <div class="detail-info-row"><span class="label">Warnings</span><span class="value"><span class="warning-counter ${warningClass}" style="padding:4px 10px;font-size:0.8rem" id="detail-warnings-box"><span id="detail-warnings">${active.warnings || 0} / ${maxW}</span></span></span></div>
            <div class="detail-info-row"><span class="label">StartedAt</span><span class="value" style="font-size:0.8rem">${formatDateTime(active.startedAt)}</span></div>
            <h4 style="margin-top:8px;font-size:0.85rem;color:var(--text-secondary)">
              <i class="fa-solid fa-triangle-exclamation" style="color:var(--warning)"></i> Warning History
            </h4>
            <div class="warning-timeline">${warningTimelineHTML}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  const refreshInterval = setInterval(() => {
    const fresh = ActiveExamDB.getByStudent(studentId);
    const modalOverlay = document.querySelector('.nexa-modal-overlay');
    
    if (!fresh || !modalOverlay) {
      clearInterval(refreshInterval);
      if (!fresh && modalOverlay) {
        closeModal();
        showToast('Student has completed the examination.', 'success');
      }
      return;
    }
    
    // 📹 High-Speed Video Stream Pull
    const pullLiveFeed = async () => {
      try {
        const res = await fetch(CONFIG.API_BASE_URL + `/api/live-feed/pull?studentId=${studentId}`);
        const result = await res.json();
        
        if (result.success && result.feed) {
          const { snapshot, metadata } = result.feed;
          
          // Update Camera View
          const modalCamera = document.getElementById('proctor-detail-camera');
          if (modalCamera && snapshot) {
            modalCamera.innerHTML = `<img src="${snapshot}" alt="Live stream" style="width:100%;height:100%;object-fit:cover; transition: opacity 0.3s ease;">`;
          }

          // Update other metadata live
          if (metadata) {
            const progressEl = document.getElementById('detail-progress');
            if (progressEl) progressEl.textContent = `Q${(metadata.currentQuestion || 0) + 1} / ${totalQuestions}`;

            const warningEl = document.getElementById('detail-warnings');
            if (warningEl) {
              warningEl.textContent = `${metadata.warnings || 0} / ${maxW}`;
              const box = document.getElementById('detail-warnings-box');
              if (box) box.className = `warning-counter ${metadata.warnings === 0 ? 'safe' : (metadata.warnings >= maxW - 1 ? 'high' : 'medium')}`;
            }

            // Sync Noise
            const noiseStatus = document.getElementById('proctor-noise-status');
            if (noiseStatus) {
              if (metadata.noiseDetected) {
                noiseStatus.className = 'face-status-indicator away';
                noiseStatus.innerHTML = '<i class="fa-solid fa-volume-high"></i> 🔊 Sound or Talking Detected!';
                noiseStatus.style.borderColor = 'var(--danger)';
              } else {
                noiseStatus.className = 'face-status-indicator ok';
                noiseStatus.innerHTML = '<i class="fa-solid fa-check"></i> Silence Maintained';
                noiseStatus.style.borderColor = '';
              }
            }
          }
        }
      } catch (err) {
        // network error
      }
    };

    const streamInterval = setInterval(pullLiveFeed, 800); // Sync display every 800ms
    
    // Cleanup on close
    const modalObserver = new MutationObserver(() => {
      if (!document.querySelector('.nexa-modal-overlay')) {
        clearInterval(streamInterval);
        modalObserver.disconnect();
      }
    });
    modalObserver.observe(document.body, { childList: true });

    // Update Noise Status
    const noiseStatus = document.getElementById('proctor-noise-status');
    if (noiseStatus) {
      const freshWarnings = WarningDB.getByStudentAndExam(studentId, active.examId)
        .filter(w => new Date(w.timestamp) >= new Date(fresh.startedAt));
      const hasPastNoise = freshWarnings.some(w => w.type === 'noise_detected');

      if (fresh.noiseDetected) {
        noiseStatus.className = 'face-status-indicator away';
        noiseStatus.innerHTML = '<i class="fa-solid fa-volume-high"></i> Loud Noise Detected';
        noiseStatus.style.borderColor = 'var(--danger)';
      } else if (hasPastNoise) {
        noiseStatus.className = 'face-status-indicator warning';
        noiseStatus.innerHTML = '<i class="fa-solid fa-ear-listen"></i> Noise Previously Recorded';
        noiseStatus.style.borderColor = 'var(--warning)';
      } else {
        noiseStatus.className = 'face-status-indicator ok';
        noiseStatus.innerHTML = '<i class="fa-solid fa-check"></i> Silence Maintained';
        noiseStatus.style.borderColor = '';
      }
    }

    // Update Warning History Timeline
    const timeline = document.querySelector('.warning-timeline');
    if (timeline) {
      const freshWarnings = WarningDB.getByStudentAndExam(studentId, active.examId)
        .filter(w => new Date(w.timestamp) >= new Date(fresh.startedAt));

      if (freshWarnings.length > 0) {
        timeline.innerHTML = freshWarnings.map(w => `
          <div class="warning-timeline-item">
            <div class="wt-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <div class="wt-text">${w.description}</div>
            <div class="wt-time">${timeAgo(w.timestamp)}</div>
          </div>
        `).join('');
      } else {
        timeline.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.85rem;text-align:center;padding:16px">No warnings yet in this session</p>';
      }
    }
  }, 3000);
}

function renderStudents() {
  const students = UserDB.getAll().filter(u => u.role === 'student');
  const tbody = document.getElementById('students-body');

  tbody.innerHTML = students.map(s => {
    const results = ResultDB.getByStudent(s.id);
    const warnings = WarningDB.getByStudent(s.id);
    const avg = results.length ? Math.round(results.reduce((sum, r) => sum + r.percentage, 0) / results.length) : 0;
    const isSuspicious = warnings.length >= 3;

    return `
      <tr class="${isSuspicious ? 'suspicious-row' : ''}">
        <td><div class="flex gap-sm" style="align-items:center"><img src="${s.avatar}" class="avatar avatar-sm"> ${s.name}</div></td>
        <td>${s.email}</td>
        <td>${results.length}</td>
        <td>${avg}%</td>
        <td><span class="badge ${warnings.length > 2 ? 'badge-danger' : (warnings.length > 0 ? 'badge-warning' : 'badge-success')}">${warnings.length}</span></td>
        <td>${isSuspicious ? '<span class="badge badge-danger">Suspicious</span>' : '<span class="badge badge-success">Normal</span>'}</td>
      </tr>`;
  }).join('');
}

function renderExams() {
  const exams = ExamDB.getAll() || [];
  const tbody = document.getElementById('exams-body');
  if (!tbody) return;

  if (exams.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-tertiary);">No exams created yet.</td></tr>';
    return;
  }

  tbody.innerHTML = exams.map(e => {
    const status = ExamDB.getStatus(e);
    const statusBadge = {
      live: '<span class="badge badge-danger badge-dot live">LIVE</span>',
      upcoming: '<span class="badge badge-info">Upcoming</span>',
      ended: '<span class="badge badge-success">Ended</span>',
    };

    return `
      <tr>
        <td style="font-weight:600">${e.title}</td>
        <td>${e.subject}</td>
        <td>${formatDate(e.date)}</td>
        <td>${e.duration} min</td>
        <td><span class="badge badge-info">${e.questions.length} Qs</span></td>
        <td>${statusBadge[status]}</td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="deleteExam('${e.id}')" style="color:var(--danger)">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>
      </tr>`;
  }).join('');
}

let currentViewExamId = null;

function renderResultsExamList() {
  const exams = ExamDB.getAll() || [];
  const container = document.getElementById('results-exam-list');
  const results = ResultDB.getAll() || [];

  if (!container) return;

  if (exams.length === 0) {
    container.innerHTML = '<div class="card" style="grid-column: 1 / -1; text-align:center; padding: 40px; color: var(--text-tertiary);"><i class="fa-solid fa-file-circle-exclamation" style="font-size:2rem;margin-bottom:10px;display:block;opacity:0.3"></i>No exams found in database</div>';
    return;
  }

  container.innerHTML = exams.map(e => {
    const examResults = results.filter(r => r.examId === e.id);
    const passed = examResults.filter(r => r.passed).length;
    const titleClean = (e.title || 'Untitled Exam').replace(/'/g, "\\'");
    return `
      <div class="card stat-card result-exam-card" style="cursor:pointer; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); min-height:160px; display:flex; flex-direction:column;" onclick="showExamResults('${e.id}', '${titleClean}')">
        <div style="flex:1; display:flex; align-items:center; gap:12px;">
          <div class="stat-icon gradient-primary"><i class="fa-solid fa-file-lines"></i></div>
          <div class="stat-content" style="flex:1; min-width:0;">
             <h3 style="font-size:1.1rem; margin-bottom:4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${e.title || 'Untitled'}">${e.title || 'Untitled'}</h3>
             <div style="font-size:0.85rem; color:var(--text-tertiary)">
               <span><i class="fa-solid fa-users"></i> ${examResults.length} Submissions</span> • 
               <span style="color:var(--accent)"><i class="fa-solid fa-check-circle"></i> ${passed} Passed</span>
             </div>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" style="width:100%; margin-top:20px; pointer-events:none;">
          View Results & Recordings <i class="fa-solid fa-arrow-right" style="margin-left:5px"></i>
        </button>
      </div>
    `;
  }).join('');
}

function showResultsExamList() {
  const examView = document.getElementById('results-exam-view');
  const globalActions = document.getElementById('results-global-actions');
  const detailView = document.getElementById('results-detail-view');
  
  if (examView) examView.style.display = 'block';
  if (globalActions) globalActions.style.display = 'flex';
  if (detailView) detailView.style.display = 'none';
  
  currentViewExamId = null;
  renderResultsExamList();
}

async function exportCurrentExamPDF() {
  if (!currentViewExamId) return;
  const exam = ExamDB.getById(currentViewExamId);
  if (!exam) return;
  await exportExamSummaryPDF(exam.id);
}

async function showExamResults(examId, title) {
  currentViewExamId = examId;
  document.getElementById('results-exam-view').style.display = 'none';
  document.getElementById('results-global-actions').style.display = 'none';
  document.getElementById('results-detail-view').style.display = 'block';
  document.getElementById('detail-exam-title').textContent = title;
  
  const recordings = await RecordingDB.fetchAll();
  const examResults = ResultDB.getAll().filter(r => r.examId === examId).sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  const tbody = document.getElementById('results-body');
  
  const availableRecs = examResults.filter(r => recordings.find(re => re.studentId === r.studentId && re.examId === r.examId)).length;
  const summaryEl = document.getElementById('recording-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `<i class="fa-solid fa-video"></i> ${availableRecs} of ${examResults.length} recordings available for download`;
  }

  if (examResults.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-tertiary);">No submissions for this exam yet.</td></tr>';
    return;
  }

  const studentResults = {};
  [...examResults].sort((a,b) => new Date(a.submittedAt) - new Date(b.submittedAt)).forEach(r => {
    if (!studentResults[r.studentId]) studentResults[r.studentId] = [];
    studentResults[r.studentId].push(r.id || r.submittedAt);
  });

  tbody.innerHTML = examResults.map(r => {
    const studentAttempts = studentResults[r.studentId] || [];
    const attemptNr = studentAttempts.indexOf(r.id || r.submittedAt) + 1;
    const attemptBadge = `<span class="badge badge-info" style="font-weight:600; font-size:0.7rem; padding:3px 8px; border-radius:30px;">#${attemptNr}</span>`;

    let rec = null;
    if (r.recordingFilename) {
      rec = recordings.find(re => re.filename === r.recordingFilename);
    }
    if (!rec) {
      rec = recordings.find(re => re.studentId === r.studentId && re.examId === r.examId);
    }
    
    let recBtn = '<span style="color:var(--text-tertiary); font-size:0.8rem">N/A</span>';
    
    if (rec) {
      let recUrl = rec.serverUrl || rec.url;
      if (recUrl && recUrl.startsWith('/')) recUrl = CONFIG.API_BASE_URL + recUrl;

      if (recUrl) {
        let audioBtn = '';
        let audioUrl = rec.audioUrl;
        if (audioUrl && audioUrl.startsWith('/')) audioUrl = CONFIG.API_BASE_URL + audioUrl;

        if (audioUrl) {
          audioBtn = `
            <div class="flex gap-xs" style="margin-top:4px">
              <button class="btn btn-ghost btn-sm" style="color:var(--accent)" onclick="playAdminRecording('${audioUrl}', '${r.studentName}', '${r.examTitle}', '${rec.audioFilename}')"><i class="fa-solid fa-volume-high"></i> Play Audio</button>
              <a href="${audioUrl}" download="${rec.audioFilename || 'audio.webm'}" class="btn btn-ghost btn-sm" style="opacity:0.7"><i class="fa-solid fa-download"></i> Save Audio</a>
            </div>`;
        }
        recBtn = `
          <div class="flex gap-xs flex-wrap">
            <button class="btn btn-secondary btn-sm" onclick="playAdminRecording('${recUrl}', '${r.studentName}', '${r.examTitle}', '${rec.filename}')"><i class="fa-solid fa-play"></i> Play</button>
            <a href="${recUrl}" download="${rec.filename}" class="btn btn-secondary btn-sm"><i class="fa-solid fa-download"></i> Save Video</a>
            ${audioBtn}
          </div>`;
      }
    }
    return `
    <tr class="${r.warnings >= 2 ? 'suspicious-row' : ''}">
      <td><div class="flex gap-sm" style="align-items:center"><img src="${UserDB.getById(r.studentId)?.avatar || ''}" class="avatar avatar-sm"> <strong>${r.studentName}</strong></div></td>
      <td>${attemptBadge}</td>
      <td style="font-weight:700; color:var(--primary)">${r.score}/${r.totalMarks}</td>
      <td>${r.percentage}%</td>
      <td><span class="badge ${r.passed ? 'badge-success' : 'badge-danger'}">${r.passed ? 'Passed' : 'Failed'}</span></td>
      <td><span class="badge ${r.warnings > 0 ? (r.warnings >= 2 ? 'badge-danger' : 'badge-warning') : 'badge-success'}">${r.warnings}</span></td>
      <td>${recBtn}</td>
      <td>
        <button class="btn btn-ghost btn-sm" style="color:var(--primary)" onclick="downloadResultCard('${r.id}')">
          <i class="fa-solid fa-file-pdf"></i> Report
        </button>
      </td>
      <td style="font-size:0.8rem;color:var(--text-tertiary)">${formatDateTime(r.submittedAt)}</td>
    </tr>
    `;
  }).join('');
}

function exportCurrentExamCSV() {
  if (!currentViewExamId) return;
  const examResults = ResultDB.getAll().filter(r => r.examId === currentViewExamId);
  if (examResults.length === 0) { showToast('No results to export', 'warning'); return; }

  let csv = 'Student,Score,Total Marks,Percentage,Result,Warnings,Submitted At\n';
  examResults.forEach(r => {
    csv += `"${r.studentName}",${r.score},${r.totalMarks},${r.percentage}%,${r.passed ? 'Passed' : 'Failed'},${r.warnings},"${formatDateTime(r.submittedAt)}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `NEXA_${examResults[0].examTitle.replace(/\s+/g,'_')}_Results.csv`;
  a.click();
  showToast('Results exported as CSV! 📄', 'success');
}

async function downloadResultCard(resultId) {
  const result = ResultDB.getById(resultId);
  if (!result) { showToast('Result not found', 'error'); return; }
  showToast('Generating report...', 'info');
  await exportResultPDF(result);
}

function playAdminRecording(url, studentName, examTitle, filename) {
  const modal = document.getElementById('recording-modal');
  const player = document.getElementById('recording-player');
  const titleEl = document.getElementById('recording-modal-title');
  const downloadBtn = document.getElementById('recording-download-btn');
  if (!modal || !player) return;

  const isAudio = filename && filename.includes('.audio');
  player.src = url;
  player.load();

  if (titleEl) {
    titleEl.innerHTML = isAudio ? `<i class="fa-solid fa-volume-high"></i> ${studentName} — Audio Analysis` : `📹 ${studentName} — Exam Recording`;
  }
  
  if (downloadBtn) {
    downloadBtn.href = url;
    downloadBtn.download = filename || (isAudio ? 'audio.webm' : 'recording.webm');
    downloadBtn.innerHTML = isAudio ? '<i class="fa-solid fa-download"></i> Download Audio' : '<i class="fa-solid fa-download"></i> Download Video';
  }
  
  // Update video player style for audio-only
  if (isAudio) {
    player.style.height = '100px';
    player.style.background = 'linear-gradient(135deg, #1e1e2d 0%, #2c2c3e 100%)';
    player.poster = 'https://api.dicebear.com/7.x/initials/svg?seed=Audio&backgroundColor=6C63FF';
  } else {
    player.style.height = ''; 
    player.style.background = '#000';
    player.poster = '';
  }

  modal.classList.add('show');
  player.play().catch(err => {
    console.warn('[NEXA] Playback failed/blocked:', err);
    showToast('Click play on the player to start', 'info');
  });
}

function closeAdminRecording() {
  const modal = document.getElementById('recording-modal');
  const player = document.getElementById('recording-player');
  if (player) { player.pause(); player.src = ''; }
  if (modal) modal.classList.remove('show');
}

function renderWarningLogs() {
  const filterType = document.getElementById('warning-filter-type')?.value;
  let warnings = WarningDB.getAll();
  if (filterType) warnings = warnings.filter(w => w.type === filterType);
  warnings.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const tbody = document.getElementById('warnings-body');
  const typeIcons = {
    face_absent: 'fa-face-frown',
    camera_off: 'fa-video-slash',
    tab_switch: 'fa-window-restore',
    keyboard: 'fa-keyboard',
    right_click: 'fa-computer-mouse',
    copy_paste: 'fa-copy',
  };

  tbody.innerHTML = warnings.map(w => {
    const user = UserDB.getById(w.studentId);
    const exam = ExamDB.getById(w.examId);
    return `
      <tr>
        <td><div class="flex gap-sm" style="align-items:center"><img src="${user?.avatar || ''}" class="avatar avatar-sm"> ${user?.name || 'Unknown'}</div></td>
        <td>${exam?.title || 'Unknown'}</td>
        <td><span class="badge badge-danger"><i class="fa-solid ${typeIcons[w.type] || 'fa-exclamation'}"></i> ${w.type.replace(/_/g, ' ')}</span></td>
        <td>${w.description}</td>
        <td style="font-size:0.8rem;color:var(--text-tertiary)">${formatDateTime(w.timestamp)}</td>
      </tr>`;
  }).join('');
}

function renderAnalytics() {
  const results = ResultDB.getAll();
  const buckets = { '0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0 };
  results.forEach(r => {
    if (r.percentage <= 20) buckets['0-20']++;
    else if (r.percentage <= 40) buckets['21-40']++;
    else if (r.percentage <= 60) buckets['41-60']++;
    else if (r.percentage <= 80) buckets['61-80']++;
    else buckets['81-100']++;
  });

  if (chartInstances.scoreDist) chartInstances.scoreDist.destroy();
  const ctx3 = document.getElementById('chart-score-dist')?.getContext('2d');
  if (ctx3) {
    chartInstances.scoreDist = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: Object.keys(buckets),
        datasets: [{
          label: 'Students',
          data: Object.values(buckets),
          backgroundColor: ['#FF4757', '#FFA502', '#3498DB', '#00D4AA', '#6C63FF'],
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9B9BB8', font: { family: 'Inter' } }, grid: { display: false } },
          y: { ticks: { color: '#9B9BB8', font: { family: 'Inter' }, stepSize: 1 }, grid: { color: 'rgba(108,99,255,0.08)' } },
        },
      },
    });
  }

  const studentScores = {};
  results.forEach(r => {
    if (!studentScores[r.studentName]) studentScores[r.studentName] = [];
    studentScores[r.studentName].push(r.percentage);
  });
  const topStudents = Object.entries(studentScores)
    .map(([name, scores]) => ({ name, avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 6);

  if (chartInstances.topStudents) chartInstances.topStudents.destroy();
  const ctx4 = document.getElementById('chart-top-students')?.getContext('2d');
  if (ctx4) {
    chartInstances.topStudents = new Chart(ctx4, {
      type: 'bar',
      data: {
        labels: topStudents.map(s => s.name),
        datasets: [{
          label: 'Avg Score %',
          data: topStudents.map(s => s.avg),
          backgroundColor: topStudents.map((_, i) => ['#6C63FF', '#00D4AA', '#3498DB', '#FFA502', '#A855F7', '#EC4899'][i]),
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { max: 100, ticks: { color: '#9B9BB8', font: { family: 'Inter' } }, grid: { color: 'rgba(108,99,255,0.08)' } },
          y: { ticks: { color: '#9B9BB8', font: { family: 'Inter', size: 11 } }, grid: { display: false } },
        },
      },
    });
  }
}

function exportAllResultsCSV() {
  const results = ResultDB.getAll();
  if (results.length === 0) { showToast('No results to export', 'warning'); return; }

  let csv = 'Student,Exam,Score,Total Marks,Percentage,Result,Warnings,Submitted At\n';
  results.forEach(r => {
    csv += `"${r.studentName}","${r.examTitle}",${r.score},${r.totalMarks},${r.percentage}%,${r.passed ? 'Passed' : 'Failed'},${r.warnings},"${formatDateTime(r.submittedAt)}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `NEXA_Results_Export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  showToast('Results exported as CSV! 📄', 'success');
}

function handleGlobalSearch(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.data-table tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
