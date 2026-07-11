// ============================================================
// NEXA Student Module — Dashboard, Exam Flow, All Logic
// ============================================================

let currentUser = null;
let currentExam = null;
let currentQuestions = [];
let currentQuestionIndex = 0;
let answers = {};
let warningCount = 0;
let maxWarnings = 3;
let isExamActive = false;
let statusUpdateInterval = null;
let timeRemaining = 0;
let currentExamFilter = 'all';

// ─── Tab Integrity Monitor ────────────────────────────────
const TabIntegrity = {
  channel: new BroadcastChannel('nexa_exam_integrity'),
  tabId: Math.random().toString(36).substr(2, 9),
  otherTabs: new Set(),
  
  init() {
    this.channel.onmessage = (e) => {
      if (e.data.type === 'ping' && e.data.id !== this.tabId) {
        this.otherTabs.add(e.data.id);
        this.channel.postMessage({ type: 'pong', id: this.tabId });
        this.updateUI();
      } else if (e.data.type === 'pong' && e.data.id !== this.tabId) {
        this.otherTabs.add(e.data.id);
        this.updateUI();
      } else if (e.data.type === 'close' && e.data.id !== this.tabId) {
        this.otherTabs.delete(e.data.id);
        this.updateUI();
      }
    };
    
    // Notify on exit
    window.addEventListener('beforeunload', () => {
      this.channel.postMessage({ type: 'close', id: this.tabId });
    });

    this.ping();
    // Continuous background validation
    setInterval(() => this.ping(), 4000);
  },
  
  ping() {
    this.otherTabs.clear();
    this.channel.postMessage({ type: 'ping', id: this.tabId });
    // Small delay to collect pongs
    setTimeout(() => this.updateUI(), 1000);
  },
  
  updateUI() {
    const count = this.otherTabs.size;
    const warningEl = document.getElementById('tab-integrity-warning');
    const countEl = document.getElementById('duplicate-tab-count');
    const startBtn = document.getElementById('start-exam-btn');
    const agreeCheck = document.getElementById('agree-checkbox');

    if (!warningEl) return;

    if (count > 0) {
      warningEl.style.display = 'block';
      if (countEl) countEl.textContent = count;
      if (startBtn) startBtn.disabled = true;
    } else {
      warningEl.style.display = 'none';
      if (startBtn && agreeCheck) {
        startBtn.disabled = !agreeCheck.checked;
      }
    }
  },

  getCount() {
    return this.otherTabs.size;
  }
};

// ─── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  currentUser = requireAuth(['student']);
  if (!currentUser) return;

  ThemeManager.init();
  initSidebar();
  updateUserUI();
  renderDashboard();
  renderAllExams(currentExamFilter);
  renderResults();
  startNotificationPolling();
  TabIntegrity.init();

  // Cross-tab sync: refresh when a QM creates/edits exam in another tab
  const handleStorageSync = (e) => {
    const key = e.key || (e.detail && e.detail.key);
    if (!key) return;

    if (key === 'nexa_exams') {
      renderDashboard();
      renderAllExams(currentExamFilter);
    }
    if (key === 'nexa_results') {
      renderResults();
      renderDashboard(); // refresh stats
    }
  };

  window.addEventListener('storage', handleStorageSync);
  window.addEventListener('nexa:storage', handleStorageSync);
  
  // Agree checkbox
  document.getElementById('agree-checkbox').addEventListener('change', (e) => {
    document.getElementById('start-exam-btn').disabled = !e.target.checked;
  });

  // Profile form
  document.getElementById('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('edit-name').value.trim();
    if (name) {
      currentUser = UserDB.update(currentUser.id, { name });
      Session.set(currentUser);
      updateUserUI();
      showToast('Profile updated! ✅', 'success');
    }
  });
});

function updateUserUI() {
  document.getElementById('sidebar-name').textContent = currentUser.name;
  document.getElementById('sidebar-avatar').src = currentUser.avatar;
  document.getElementById('profile-name').textContent = currentUser.name;
  document.getElementById('profile-email').textContent = currentUser.email;
  document.getElementById('profile-avatar').src = currentUser.avatar;
  document.getElementById('edit-name').value = currentUser.name;
  document.getElementById('edit-email').value = currentUser.email;
}

// ─── Sidebar & Notifications ──────────────────────────────
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
  const notifs = NotificationDB.getForStudent(currentUser.id);
  const unread = NotificationDB.getUnreadForStudent(currentUser.id).length;
  const badge = document.getElementById('notif-count');
  badge.textContent = unread;
  badge.style.display = unread > 0 ? 'flex' : 'none';

  const list = document.getElementById('notifications-list');
  if (notifs.length === 0) {
    list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-bell-slash"></i><h3>No notifications</h3></div>';
    return;
  }

  list.innerHTML = notifs.slice(0, 30).map(n => {
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
    const unread = NotificationDB.getUnreadForStudent(currentUser.id).length;
    const badge = document.getElementById('notif-count');
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
  }, 3000);
}

// ─── Dashboard ─────────────────────────────────────────────
function renderDashboard() {
  const exams = ExamDB.getAll();
  const results = ResultDB.getByStudent(currentUser.id);

  // Stats
  const dashboardStats = document.getElementById('student-stats');

  const totalMarks = results.reduce((s, r) => s + r.totalMarks, 0);
  const totalScore = results.reduce((s, r) => s + r.score, 0);
  const avgScore = results.length > 0 ? Math.round((totalScore / totalMarks) * 100) : 0;
  const liveCount = exams.filter(e => ExamDB.getStatus(e) === 'live').length;
  const upcoming = exams.filter(e => ExamDB.getStatus(e) === 'upcoming').length;

  dashboardStats.innerHTML = `
    <div class="card stat-card">
      <div class="stat-icon" style="background:var(--primary-light);color:var(--primary)">
        <i class="fa-solid fa-list-check"></i>
      </div>
      <div class="stat-content">
        <h3>${results.length}</h3>
        <p>Total Attempts</p>
      </div>
    </div>
    <div class="card stat-card">
      <div class="stat-icon" style="background:var(--danger-light);color:var(--danger)">
        <i class="fa-solid fa-bolt"></i>
      </div>
      <div class="stat-content">
        <h3>${liveCount}</h3>
        <p>Live Exams</p>
      </div>
    </div>
    <div class="card stat-card">
      <div class="stat-icon" style="background:var(--warning-light);color:var(--warning)">
        <i class="fa-solid fa-calendar"></i>
      </div>
      <div class="stat-content">
        <h3>${upcoming}</h3>
        <p>Upcoming</p>
      </div>
    </div>
    <div class="card stat-card">
      <div class="stat-icon" style="background:var(--accent-light);color:var(--accent)">
        <i class="fa-solid fa-trophy"></i>
      </div>
      <div class="stat-content">
        <h3>${avgScore}%</h3>
        <p>Avg. Score</p>
      </div>
    </div>
  `;

  // Show live + upcoming exams on dashboard
  const relevant = exams.filter(e => {
    const status = ExamDB.getStatus(e);
    return status === 'live' || status === 'upcoming';
  });
  renderExamCards(relevant, 'dashboard-exams');
}

// ─── Exam Cards ────────────────────────────────────────────
function renderExamCards(exams, containerId) {
  const container = document.getElementById(containerId);
  const results = ResultDB.getByStudent(currentUser.id);

  if (exams.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-file-circle-xmark"></i><h3>No exams found</h3><p>Check back later for new exams.</p></div>';
    return;
  }

  container.innerHTML = exams.map(exam => {
    const status = ExamDB.getStatus(exam);
    const maxAttempts = exam.maxAttempts || 1;
    const attemptsUsed = results.filter(r => r.examId === exam.id).length;
    const attemptsLeft = maxAttempts - attemptsUsed;
    const hasResult = results.find(r => r.examId === exam.id);
    const canAttempt = attemptsLeft > 0;

    let actionBtn = '';
    if (canAttempt) {
      const btnText = attemptsUsed > 0 ? 'Retake Exam' : 'Start Exam';
      const btnIcon = attemptsUsed > 0 ? 'fa-rotate-right' : 'fa-play';
      actionBtn = `<button class="btn btn-primary btn-sm" onclick="openInstructions('${exam.id}')"><i class="fa-solid ${btnIcon}"></i> ${btnText}</button>`;
    } else if (status === 'live' && !canAttempt) {
      actionBtn = `<span class="badge badge-success">All Attempts Used</span>`;
    } else if (status === 'upcoming') {
      actionBtn = `<span class="badge badge-info">Starts ${formatDate(exam.date)}</span>`;
    } else if (hasResult) {
      actionBtn = `<span class="badge ${hasResult.passed ? 'badge-success' : 'badge-danger'}">${hasResult.passed ? 'Passed' : 'Failed'} — ${hasResult.percentage}%</span>`;
    } else {
      actionBtn = `<span class="badge badge-warning">Missed</span>`;
    }

    const statusBadge = {
      live: '<span class="badge badge-danger badge-dot live">LIVE</span>',
      upcoming: '<span class="badge badge-info badge-dot">Upcoming</span>',
      ended: '<span class="badge badge-success badge-dot">Ended</span>',
    };
    const iconColors = {
      live: 'background:var(--danger-light);color:var(--danger)',
      upcoming: 'background:var(--info-light);color:var(--info)',
      ended: 'background:var(--success-light);color:var(--accent)',
    };

    return `
      <div class="exam-card">
        <div class="exam-card-header">
          <div>
            <div class="exam-title">${exam.title}</div>
            <div class="exam-subject">${exam.subject}</div>
          </div>
          <div class="exam-icon" style="${iconColors[status]}">
            <i class="fa-solid fa-file-lines"></i>
          </div>
        </div>
        <div class="exam-card-body">
          <div class="exam-meta">
            <div class="exam-meta-item"><i class="fa-solid fa-calendar"></i> ${formatDate(exam.date)}</div>
            <div class="exam-meta-item"><i class="fa-solid fa-clock"></i> ${exam.duration} min</div>
            <div class="exam-meta-item"><i class="fa-solid fa-list"></i> ${exam.questions.length} Qs</div>
            <div class="exam-meta-item"><i class="fa-solid fa-star"></i> ${exam.questions.reduce((s, q) => s + q.marks, 0)} marks</div>
            <div class="exam-meta-item" title="Attempts taken / Max allowed">
                <i class="fa-solid fa-rotate-right" style="color:var(--primary)"></i>
                <b>Attempts:</b> ${attemptsUsed} / ${maxAttempts}
            </div>
          </div>
        </div>
        <div class="exam-card-footer">
          ${statusBadge[status]}
          ${actionBtn}
        </div>
      </div>`;
  }).join('');
}

function renderAllExams(filter = 'all') {
  currentExamFilter = filter;
  let exams = ExamDB.getAll();
  if (filter !== 'all') {
    exams = exams.filter(e => ExamDB.getStatus(e) === filter);
  }
  renderExamCards(exams, 'all-exams-grid');
}

function filterExams(filter, btn) {
  document.querySelectorAll('#exam-filter-tabs .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderAllExams(filter);
}

// ─── Instruction Page ──────────────────────────────────────
function openInstructions(examId) {
  const exam = ExamDB.getById(examId);
  if (!exam) return;

  // Check attempt limit
  const maxAttempts = exam.maxAttempts || 1;
  const previousAttempts = ResultDB.getAll().filter(
    r => r.studentId === currentUser.id && r.examId === examId
  ).length;

  if (previousAttempts >= maxAttempts) {
    showToast(`❌ You have already used all ${maxAttempts} attempt(s) for this exam.`, 'error', 5000);
    return;
  }

  pendingExamId = examId;
  document.getElementById('instruction-exam-title').textContent = `${exam.title} — Instructions`;
  document.getElementById('agree-checkbox').checked = false;
  document.getElementById('start-exam-btn').disabled = true;

  // Show attempt info (Updated for Retake support)
  const attemptInfo = document.getElementById('attempt-info');
  if (attemptInfo) {
    const attemptNumber = previousAttempts + 1;
    const isRetake = previousAttempts > 0;
    attemptInfo.innerHTML = `<div style="margin-top:12px;padding:12px 16px;background:rgba(108, 99, 255, 0.1);border-radius:var(--radius-md);border-left:4px solid var(--primary);box-shadow:var(--shadow-sm)">
      <strong style="color:var(--primary);display:block;margin-bottom:4px">
        <i class="fa-solid ${isRetake ? 'fa-rotate-right' : 'fa-play'}"></i> 
        ${isRetake ? 'Retake Exam' : 'First Attempt'}
      </strong>
      <div style="font-size:0.9rem;color:var(--text-secondary)">
        You are starting <b>Attempt ${attemptNumber}</b> of <b>${maxAttempts}</b>. 
        <span style="color:var(--text-tertiary);margin-left:8px">(${maxAttempts - attemptNumber} remaining after this)</span>
      </div>
    </div>`;
  }

  // Add custom instructions if present
  const customDiv = document.getElementById('custom-instructions');
  if (exam.instructions) {
    customDiv.innerHTML = `<h4 style="margin:20px 0 10px;color:var(--primary)"><i class="fa-solid fa-info-circle"></i> Additional Instructions</h4>
      <div style="font-size:0.9rem;line-height:1.6;color:var(--text-secondary)">${exam.instructions}</div>`;
  } else {
    customDiv.innerHTML = '';
  }

  document.getElementById('instruction-overlay').classList.add('active');
  
  // Perform initial tab check
  TabIntegrity.ping();
}

function closeInstructions() {
  document.getElementById('instruction-overlay').classList.remove('active');
  pendingExamId = null;
}

async function startExamAfterInstructions() {
  if (!pendingExamId) return;

  // Final validation before start
  if (TabIntegrity.getCount() > 0) {
    showToast('⚠️ Multiple tabs detected. Please close all other exam tabs before starting.', 'error', 5000);
    TabIntegrity.updateUI();
    return;
  }

  document.getElementById('instruction-overlay').classList.remove('active');
  await startExam(pendingExamId);
}

// ─── Start Exam ────────────────────────────────────────────

// Fullscreen API Helper
function enterFullScreen() {
  const elem = document.documentElement;
  if (elem.requestFullscreen) {
    elem.requestFullscreen().catch(err => console.warn('Fullscreen denied:', err));
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) {
    elem.msRequestFullscreen();
  }
}

function exitFullScreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
}

// Fullscreen monitor
function onFullScreenChange() {
  if (isExamActive && !document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
    handleWarning('fullscreen_exit', 'Student exited fullscreen mode during exam');
    showModal('Fullscreen Required ⚠️', `
      <div style="text-align:center">
        <div style="font-size:3rem;margin-bottom:12px">🖥️</div>
        <p>You have exited fullscreen mode. This is against the exam rules.</p>
        <p style="color:var(--danger);font-weight:700">Please return to fullscreen to continue.</p>
      </div>
    `, [
      { label: 'Enter Fullscreen', class: 'btn-primary', onclick: () => { enterFullScreen(); closeModal(); } }
    ]);
  }
}

document.addEventListener('fullscreenchange', onFullScreenChange);
document.addEventListener('webkitfullscreenchange', onFullScreenChange);
document.addEventListener('mozfullscreenchange', onFullScreenChange);
document.addEventListener('MSFullscreenChange', onFullScreenChange);


async function startExam(examId) {
  try {
    const exam = ExamDB.getById(examId);
    if (!exam) {
      showToast('❌ Exam data not found. Please try again.', 'error');
      return;
    }

    currentExam = exam;
    const settings = SettingsDB.get();
    maxWarnings = exam.warningLimit || settings.maxWarnings || 5;
    warningCount = 0;
    updateWarningDisplay(); // Instantly visually refresh the UI warning counter
    answers = {};
    currentQuestionIndex = 0;
    isExamActive = true; // Set exam as active BEFORE starting proctoring

    // Prepare questions (ensure it's an array)
    const rawQuestions = Array.isArray(exam.questions) ? exam.questions : [];
    if (rawQuestions.length === 0) {
      showToast('❌ This exam has no questions. Contact your administrator.', 'error');
      return;
    }
    currentQuestions = [...rawQuestions];

    if (exam.shuffle) {
      currentQuestions.sort(() => Math.random() - 0.5);
    }

    // Calculate time remaining (use endDate/endTime if set, else start+duration)
    const startTimeStamp = parseDateTime(exam.date, exam.time).getTime();
    const durationMs = (exam.duration || 60) * 60000;
    const endTimeStamp = (exam.endDate && exam.endTime)
      ? parseDateTime(exam.endDate, exam.endTime).getTime()
      : startTimeStamp + durationMs;
    
    timeRemaining = Math.max(0, Math.floor((endTimeStamp - Date.now()) / 1000));

    if (timeRemaining <= 0) {
      showToast('❌ This exam session has already ended.', 'error');
      return;
    }

    // ENTER FULLSCREEN
    enterFullScreen();

    // Register active exam record
    ActiveExamDB.start(currentUser.id, examId, currentUser.name, exam.title);

    // Show exam interface
    document.getElementById('exam-interface').classList.add('active');
    document.getElementById('exam-title').textContent = exam.title;
    document.getElementById('exam-subject').textContent = exam.subject;
    document.getElementById('warning-max-display').textContent = maxWarnings;

  // Init camera + face detection
  const faceInitOk = await FaceMonitor.init('exam-camera', 'exam-canvas', {
    onWarning: handleWarning,
    onImmediateWarning: (reason) => {
      // Instant visual flash warning — before grace timer expires
      showToast(`⚠️ ${reason}`, 'warning', 3000);
      // Flash the camera border red briefly
      const camPreview = document.querySelector('.camera-preview');
      if (camPreview) {
        camPreview.classList.add('flash-warning');
        setTimeout(() => camPreview.classList.remove('flash-warning'), 1500);
      }
    },
    onGraceStart: (seconds, reason) => {
      document.getElementById('grace-overlay').classList.add('show');
      document.getElementById('grace-countdown').textContent = seconds;
      document.getElementById('grace-message').textContent = reason;
    },
    onGraceTick: (seconds) => {
      document.getElementById('grace-countdown').textContent = seconds;
    },
    onGraceEnd: () => {
      document.getElementById('grace-overlay').classList.remove('show');
    },
    onFaceStatusChange: (present) => {
      const el = document.getElementById('face-status');
      const camStatus = document.getElementById('camera-status');
      if (present) {
        if (el) {
          el.className = 'face-status-indicator ok';
          el.innerHTML = '<i class="fa-solid fa-face-smile"></i> Face Detected';
        }
        if (camStatus) {
          camStatus.className = 'camera-status';
          camStatus.innerHTML = '<span class="dot"></span> LIVE';
        }
      } else {
        if (el) {
          el.className = 'face-status-indicator away';
          el.innerHTML = '<i class="fa-solid fa-face-frown"></i> Face Not Detected';
        }
        if (camStatus) {
          camStatus.className = 'camera-status warning';
          camStatus.innerHTML = '<span class="dot"></span> WARNING';
        }
      }
    },
  });

  const camOk = await FaceMonitor.startCamera();
  if (!camOk) {
    showToast('Camera access is required to start the exam!', 'error');
    document.getElementById('exam-interface').classList.remove('active');
    ActiveExamDB.end(currentUser.id);
    exitFullScreen();
    return;
  }
  
  // Force Audio Engine Activation (User Gesture context)
  if (FaceMonitor.audioCtx && FaceMonitor.audioCtx.state === 'suspended') {
    await FaceMonitor.audioCtx.resume();
  }
  
  
  FaceMonitor.startDetection();

  // 🎙️ Audio Monitoring Integration
  const micStream = FaceMonitor.stream; // Original raw stream (better for RMS volume)
  if (micStream && micStream.getAudioTracks().length > 0) {
    AudioMonitor.init(micStream, {
      threshold: 0.12, // Increased sensitivity (Lower = more sensitive)
      onNoiseDetected: (rms) => {
        handleWarning('noise_detected', 'High noise levels or talking detected');
        showToast('⚠️ Warning: Noise level is high. Please remain silent.', 'warning', 3000);
        
        // Mark noise detected in background for admin sync
        ActiveExamDB.update(currentUser.id, {
          noiseDetected: true,
          noiseTimestamp: Date.now()
        });
        
        // Auto-clear noise flag after 3 seconds
        setTimeout(() => {
          ActiveExamDB.update(currentUser.id, { noiseDetected: false });
        }, 3000);
      }
    });
  }

  // 📹 Start recording (Wait 2 seconds for warm-up to prevent black frame)
  if (ExamRecorder.isSupported()) {
    const stream = FaceMonitor.getProcessedStream();
    if (stream) {
      setTimeout(() => {
        if (!isExamActive) return; // if user quit during warm-up
        ExamRecorder.start(stream, currentUser.id, currentExam.id, currentUser.name, currentExam.title);
        // Show REC badge
        const recBadge = document.getElementById('rec-badge');
        if (recBadge) recBadge.style.display = 'flex';
      }, 2000); // 2 second delay ensures camera is fully active
    }
  }

  // Anti-cheat
  AntiCheat.start((type, desc) => handleWarning(type, desc));

  // Render first question & palette
  renderQuestion();
  renderPalette();
  startTimer();

    // 📹 High-Speed Live Video Broadcast for Admin Proctoring
    const liveBroadcastInterval = setInterval(async () => {
      if (!currentExam || !isExamActive) {
        clearInterval(liveBroadcastInterval);
        return;
      }
      
      const snap = FaceMonitor.getSnapshot();
      if (snap) {
        try {
          await fetch(CONFIG.API_BASE_URL + '/api/live-feed/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              studentId: currentUser.id,
              snapshot: snap, 
              metadata: {
                currentQuestion: currentQuestionIndex,
                warnings: warningCount,
                noiseDetected: AudioMonitor.isTriggered === true
              }
            })
          });
        } catch (e) {
          // ignore network hiccups
        }
      }
    }, 800); 

  } catch (err) {
    console.error('[Student] startExam failed:', err);
    showToast(`❌ Failed to start exam: ${err.message || 'Unknown error'}`, 'error', 10000);
    
    // Cleanup/Revert UI
    document.getElementById('exam-interface').classList.remove('active');
    ActiveExamDB.end(currentUser.id);
    if (FaceMonitor) FaceMonitor.stop();
    exitFullScreen();
    isExamActive = false;
  }
}

// ─── Warning Handler ──────────────────────────────────────
function handleWarning(type, description) {
  warningCount++;

  // Save warning
  WarningDB.add(currentUser.id, currentExam.id, type, description);

  // Update display
  updateWarningDisplay();

  // Check limit
  if (warningCount >= maxWarnings) {
    showToast('⛔ Warning limit exceeded! Auto-submitting exam...', 'error', 5000);
    setTimeout(() => submitExam(true), 2000);
  }
}

function updateWarningDisplay() {
  const display = document.getElementById('warning-display');
  document.getElementById('warning-count-display').textContent = warningCount;

  if (warningCount === 0) {
    display.className = 'warning-counter safe';
  } else if (warningCount < maxWarnings - 1) {
    display.className = 'warning-counter medium';
  } else {
    display.className = 'warning-counter high';
  }
}

// ─── Render Question ──────────────────────────────────────
function renderQuestion() {
  if (currentQuestions.length === 0) {
    console.error("NEXA: No questions found for current exam.");
    document.getElementById('question-card').innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Error: No questions found</h3>
        <p>There are no questions in this exam. Please contact your instructor.</p>
      </div>`;
    return;
  }

  const q = currentQuestions[currentQuestionIndex];
  if (!q) {
    console.error(`NEXA: Question at index ${currentQuestionIndex} is null/undefined.`);
    return;
  }

  const letters = ['A', 'B', 'C', 'D'];
  const total = currentQuestions.length;

  document.getElementById('q-progress-text').textContent = `Question ${currentQuestionIndex + 1} of ${total}`;
  document.getElementById('q-progress-bar').style.width = `${((currentQuestionIndex + 1) / total) * 100}%`;

  const selectedAnswer = answers[q.id];

  document.getElementById('question-card').innerHTML = `
    <div class="question-number">Question ${currentQuestionIndex + 1} <span style="color:var(--text-tertiary)">• ${q.marks} mark${q.marks > 1 ? 's' : ''}</span></div>
    <div class="question-text">${q.text}</div>
    <div class="question-options">
      ${q.options.map((opt, i) => `
        <div class="option-item ${selectedAnswer === i ? 'selected' : ''}" onclick="selectOption('${q.id}', ${i})">
          <div class="option-letter">${letters[i]}</div>
          <div class="option-text">${opt}</div>
        </div>
      `).join('')}
    </div>
  `;

  // Navigation buttons
  document.getElementById('prev-btn').disabled = currentQuestionIndex === 0;
  const nextBtn = document.getElementById('next-btn');
  if (currentQuestionIndex === total - 1) {
    nextBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit';
    nextBtn.onclick = () => confirmSubmitExam();
  } else {
    nextBtn.innerHTML = 'Next <i class="fa-solid fa-arrow-right"></i>';
    nextBtn.onclick = () => nextQuestion();
  }

  renderPalette();
}

function selectOption(questionId, optionIndex) {
  answers[questionId] = optionIndex;

  // Save to active exam
  ActiveExamDB.update(currentUser.id, {
    answers: { ...answers },
    currentQuestion: currentQuestionIndex,
  });

  renderQuestion();
}

function nextQuestion() {
  const q = currentQuestions[currentQuestionIndex];
  if (answers[q.id] === undefined) {
    showToast('⚠️ Please answer the current question before proceeding.', 'warning');
    return;
  }
  if (currentQuestionIndex < currentQuestions.length - 1) {
    currentQuestionIndex++;
    renderQuestion();
  }
}

function prevQuestion() {
  if (currentQuestionIndex > 0) {
    currentQuestionIndex--;
    renderQuestion();
  }
}

function goToQuestion(index) {
  // Only allow going back or to answered questions
  if (index < currentQuestionIndex || answers[currentQuestions[index]?.id] !== undefined) {
    currentQuestionIndex = index;
    renderQuestion();
  } else if (index === currentQuestionIndex) {
    // Already here
  } else {
    showToast('⚠️ Please answer the current question before skipping ahead.', 'warning');
  }
}

// ─── Question Palette ─────────────────────────────────────
function renderPalette() {
  const palette = document.getElementById('question-palette');
  palette.innerHTML = currentQuestions.map((q, i) => {
    let cls = 'not-answered';
    if (i === currentQuestionIndex) cls = 'current';
    else if (answers[q.id] !== undefined) cls = 'answered';
    return `<button class="palette-btn ${cls}" onclick="goToQuestion(${i})">${i + 1}</button>`;
  }).join('');
}

// ─── Timer ────────────────────────────────────────────────
function startTimer() {
  updateTimerDisplay();
  examTimer = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();

    if (timeRemaining <= 0) {
      clearInterval(examTimer);
      showToast('⏰ Time is up! Auto-submitting...', 'warning', 5000);
      setTimeout(() => submitExam(true), 2000);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  document.getElementById('exam-timer').textContent = display;

  const box = document.getElementById('exam-timer-box');
  if (timeRemaining <= 60) {
    box.classList.add('urgent');
  } else {
    box.classList.remove('urgent');
  }
}

// ─── Submit Exam ──────────────────────────────────────────
function confirmSubmitExam() {
  const answered = Object.keys(answers).length;
  const total = currentQuestions.length;

  showModal('Submit Exam?', `
    <div style="text-align:center">
      <div style="font-size:3rem;margin-bottom:12px">📝</div>
      <p style="color:var(--text-secondary);margin-bottom:16px">
        You have answered <b style="color:var(--primary)">${answered}</b> out of <b>${total}</b> questions.
        ${answered < total ? `<br><span style="color:var(--warning)">${total - answered} question(s) unanswered.</span>` : ''}
      </p>
      <p style="color:var(--text-tertiary);font-size:0.85rem">This action cannot be undone.</p>
    </div>
  `, [
    { label: 'Cancel', class: 'btn-secondary', onclick: 'closeModal()' },
    { label: 'Submit Exam', class: 'btn-primary', onclick: 'submitExam(false); closeModal();' },
  ]);
}

async function submitExam(isAuto = false) {
  if (!currentExam) return;

  isExamActive = false; // Mark exam inactive
  clearInterval(examTimer);
  AntiCheat.stop();
  FaceMonitor.stop();
  AudioMonitor.stop();
  exitFullScreen(); // EXIT FULLSCREEN

  // Hide REC badge
  const recBadge = document.getElementById('rec-badge');
  if (recBadge) recBadge.style.display = 'none';

  // Show "Uploading recordings..." toast
  showToast('⌛ Saving exam results & recordings...', 'info', 5000);

  // Stop & upload recording (AWAIT this now)
  const examSnap = { ...currentExam };
  const userSnap = { ...currentUser };
  let recFilename = null;
  let audioFilename = null;

  try {
    const result = await ExamRecorder.stop();
    if (result && result.success) {
      RecordingDB.save(
        userSnap.id, examSnap.id,
        userSnap.name, examSnap.title,
        result.url, result.filename, result.sizeKB
      );
      recFilename = result.filename;
      audioFilename = result.audioFilename; // Captured from improved server response
      showToast(`📹 Recording saved (${result.sizeKB} KB)`, 'success', 3000);
    }
  } catch (err) {
    console.error('[NEXA] Recording upload error:', err);
  }

  // Calculate score
  let score = 0;
  let totalMarks = 0;
  currentQuestions.forEach(q => {
    totalMarks += (q.marks || 1);
    if (answers[q.id] === q.correct) {
      score += (q.marks || 1);
    }
  });

  const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
  const passed = percentage >= (currentExam.passPercent || 50);

  // Save result with DIRECT LINK to recording
  const result = ResultDB.create({
    studentId: currentUser.id,
    studentName: currentUser.name,
    examId: currentExam.id,
    examTitle: currentExam.title,
    score, totalMarks, percentage, passed,
    warnings: warningCount,
    recordingFilename: recFilename,
    audioFilename: audioFilename,
    answers: { ...answers },
    autoSubmitted: isAuto,
  });

  // End active exam
  ActiveExamDB.update(currentUser.id, {
    status: isAuto ? 'auto_submitted' : 'completed',
  });
  ActiveExamDB.end(currentUser.id);

  // Close exam interface
  document.getElementById('exam-interface').classList.remove('active');
  document.getElementById('grace-overlay').classList.remove('show');

  // Send Email Report
  fetch(CONFIG.API_BASE_URL + '/api/email/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: currentUser.email,
      name: currentUser.name,
      subject: `🏆 Exam Result: ${currentExam.title}`,
      message: `
        <p>Hello <strong>${currentUser.name}</strong>,</p>
        <p>Your exam <strong>${currentExam.title}</strong> has been submitted successfully.</p>
        <div style="background:rgba(108, 99, 255, 0.05); padding:20px; border-radius:10px; border:1px solid rgba(108, 99, 255, 0.2); margin: 20px 0;">
          <div style="font-size: 24px; font-weight: 800; color: #6C63FF; margin-bottom: 10px;">${percentage}%</div>
          <p style="margin: 4px 0;"><strong>Score:</strong> ${score} / ${totalMarks}</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> ${passed ? '<span style="color:#00d4aa; font-weight:bold;">PASSED ✅</span>' : '<span style="color:#ff4757; font-weight:bold;">FAILED ❌</span>'}</p>
          <p style="margin: 4px 0;"><strong>Security Warnings:</strong> ${warningCount}</p>
        </div>
        <p>Thank you for using the NEXA Exam System. You can view your detailed breakdown in the dashboard.</p>
      `
    }),
  }).catch(err => console.warn('[NEXA] Report email failed:', err));

  // Show result modal
  showModal('Exam Submitted! 📝', `
    <div style="text-align:center">
      <div style="width:100px;height:100px;border-radius:50%;background:${passed ? 'var(--success-light)' : 'var(--danger-light)'};
        color:${passed ? 'var(--accent)' : 'var(--danger)'};display:flex;align-items:center;justify-content:center;
        font-size:2.5rem;margin:0 auto 20px;animation:scaleIn 0.5s ease">
        ${passed ? '🎉' : '😞'}
      </div>
      <h3 style="margin-bottom:4px">${passed ? 'Congratulations!' : 'Better Luck Next Time'}</h3>
      <p style="color:var(--text-secondary);margin-bottom:20px">${isAuto ? 'Your exam was auto-submitted' : 'Exam completed successfully'}</p>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
        <div style="padding:14px;background:var(--bg-input);border-radius:var(--radius-md);text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:var(--primary)">${score}/${totalMarks}</div>
          <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:2px">Score</div>
        </div>
        <div style="padding:14px;background:var(--bg-input);border-radius:var(--radius-md);text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:${passed ? 'var(--accent)' : 'var(--danger)'}">${percentage}%</div>
          <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:2px">Percentage</div>
        </div>
        <div style="padding:14px;background:var(--bg-input);border-radius:var(--radius-md);text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:${warningCount > 0 ? 'var(--warning)' : 'var(--accent)'}">${warningCount}</div>
          <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:2px">Warnings</div>
        </div>
      </div>

      <span class="badge ${passed ? 'badge-success' : 'badge-danger'}" style="font-size:0.85rem;padding:6px 16px">
        ${passed ? '✅ PASSED' : '❌ FAILED'}
      </span>
      <p style="font-size:0.75rem; color:var(--text-tertiary); margin-top:15px;"><i class="fa-solid fa-envelope"></i> A copy of this report has been sent to your email.</p>
    </div>
  `, [
    { label: 'View Results', class: 'btn-primary', onclick: "closeModal(); document.querySelector('[data-section=\"sec-results\"]').click();" },
  ]);

  // Reset
  currentExam = null;
  currentQuestions = [];
  warningCount = 0;
  answers = {};

  // Refresh views
  renderDashboard();
  renderAllExams();
  renderResults();
}

// ─── Results ──────────────────────────────────────────────
function renderResults() {
  const results = ResultDB.getByStudent(currentUser.id);
  const recordings = RecordingDB.getByStudent(currentUser.id);
  const container = document.getElementById('results-container');

  if (results.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-chart-column"></i><h3>No results yet</h3><p>Complete exams to see your results here.</p></div>';
    return;
  }

  container.innerHTML = results.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).map(r => {
    return `
    <div class="result-card">
      <div class="result-card-header">
        <div>
          <h3 style="font-size:1.05rem">${r.examTitle}</h3>
          <p style="font-size:0.8rem;color:var(--text-tertiary);margin-top:2px">${formatDateTime(r.submittedAt)}</p>
        </div>
        <span class="badge ${r.passed ? 'badge-success' : 'badge-danger'}">${r.passed ? 'PASSED' : 'FAILED'}</span>
      </div>
      <div class="result-card-body">
        <div class="result-stats">
          <div class="result-stat">
            <div class="stat-value text-primary">${r.score}/${r.totalMarks}</div>
            <div class="stat-label">Score</div>
          </div>
          <div class="result-stat">
            <div class="stat-value" style="color:${r.passed ? 'var(--accent)' : 'var(--danger)'}">${r.percentage}%</div>
            <div class="stat-label">Percentage</div>
          </div>
          <div class="result-stat">
            <div class="stat-value" style="color:${r.warnings > 0 ? 'var(--warning)' : 'var(--accent)'}">${r.warnings}</div>
            <div class="stat-label">Warnings</div>
          </div>
          <div class="result-stat">
            <div class="stat-value text-primary">${r.autoSubmitted ? 'Auto' : 'Manual'}</div>
            <div class="stat-label">Submission</div>
          </div>
        </div>
      </div>
      <div class="result-card-footer">
        <div class="flex gap-xs">
          <button class="btn btn-secondary btn-sm" onclick='exportResultText(${JSON.stringify(r).replace(/'/g, "\\'")})'><i class="fa-solid fa-file-lines"></i> Text</button>
          <button class="btn btn-primary btn-sm" onclick='exportResultPDF(${JSON.stringify(r).replace(/'/g, "\\'")})'><i class="fa-solid fa-file-pdf"></i> PDF</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── Recording Playback Modal ───────────────────────────────
function playRecording(url, title, filename) {
  const modal = document.getElementById('recording-modal');
  const player = document.getElementById('recording-player');
  const titleEl = document.getElementById('recording-modal-title');
  const downloadBtn = document.getElementById('recording-download-btn');
  if (!modal || !player) return;

  player.src = url;
  if (titleEl) titleEl.textContent = `📹 ${title}`;
  if (downloadBtn) {
    downloadBtn.href = getDownloadUrl(url);
    downloadBtn.download = filename || 'recording.webm';
  }
  
  modal.classList.add('show');
  player.play().catch(() => {});
}

function closeRecordingModal() {
  const modal = document.getElementById('recording-modal');
  const player = document.getElementById('recording-player');
  if (player) { player.pause(); player.src = ''; }
  if (modal) modal.classList.remove('show');
}
