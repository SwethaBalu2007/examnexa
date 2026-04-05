// ============================================================
// NEXA Question Manager Module
// ============================================================

let currentUser = null;
let editingExamId = null;
let builderQuestions = [];

// ─── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  currentUser = requireAuth(['question_manager', 'admin']);
  if (!currentUser) return;

  ThemeManager.init();
  initSidebar();
  updateUserUI();
  renderManageExams();
  renderBuilderQuestions();

  // Sidebar - specific handlers
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      if (!section) return;

      // Update active nav link
      document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
      link.classList.add('active');

      // Update active section visibility
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
      const activeSec = document.getElementById(section);
      if (activeSec) activeSec.classList.add('active');

      // Call section-specific renderers
      if (section === 'sec-results') renderResultsList();
      if (section === 'sec-manage') renderManageExams();
    });
  });

  // Form submit
  document.getElementById('exam-builder-form').addEventListener('submit', handleSaveExam);

  // Explicitly wire step buttons for reliability
  const nextBtn = document.getElementById('builder-next-btn');
  const prevBtn = document.getElementById('builder-prev-btn');
  if (nextBtn) nextBtn.onclick = () => builderStep(2);
  if (prevBtn) prevBtn.onclick = () => builderStep(1);

  // Cross-tab sync: refresh views when localStorage changes in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === 'nexa_exams') {
      renderManageExams();
    }
    if (e.key === 'nexa_results') {
      const activeSection = document.querySelector('.content-section.active');
      if (activeSection && activeSection.id === 'sec-results') renderResultsList();
    }
  });

  // Same-tab sync: react to storage writes that happened in this tab
  window.addEventListener('nexa:storage', (e) => {
    const key = e.detail?.key;
    if (key === 'nexa_exams') {
      renderManageExams();
    }
    if (key === 'nexa_results') {
      const activeSection = document.querySelector('.content-section.active');
      if (activeSection && activeSection.id === 'sec-results') renderResultsList();
    }
  });

  // ── Auto-refresh statuses every 30s (live → ended, upcoming → live, etc.) ──
  setInterval(() => {
    const activeSection = document.querySelector('.content-section.active');
    if (activeSection && activeSection.id === 'sec-manage') {
      renderManageExams();
    }
  }, 30000);
});

function updateUserUI() {
  document.getElementById('sidebar-name').textContent = currentUser.name;
  document.getElementById('sidebar-avatar').src = currentUser.avatar;
}

// ─── End Date/Time Auto-Sync ─────────────────────────────────
function syncEndDateTime() {
  const dateVal = document.getElementById('build-date').value;
  const timeVal = document.getElementById('build-time').value;
  const durVal  = parseInt(document.getElementById('build-duration').value);

  if (!dateVal || !timeVal || isNaN(durVal) || durVal <= 0) return;

  const [y, m, d] = dateVal.split('-').map(Number);
  const [hr, min] = timeVal.split(':').map(Number);
  const startMs = new Date(y, m - 1, d, hr, min).getTime();
  const endDate = new Date(startMs + durVal * 60000);

  const pad = (n) => String(n).padStart(2, '0');
  const endDateStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
  const endTimeStr = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;

  document.getElementById('build-end-date').value = endDateStr;
  document.getElementById('build-end-time').value = endTimeStr;
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
}

// ─── Manage Exams ─────────────────────────────────────────
function renderManageExams() {
  // QMs only see their own exams, Admins see all
  let exams = ExamDB.getAll();
  if (currentUser.role === 'question_manager') {
    exams = ExamDB.getByCreator(currentUser.id);
  }

  const container = document.getElementById('manage-exams-grid');

  if (exams.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-folder-open"></i><h3>No exams created</h3><p>Click "Create Exam" to get started.</p></div>';
    return;
  }

  container.innerHTML = exams.map(exam => {
    const status = ExamDB.getStatus(exam);
    const results = ResultDB.getByExam(exam.id);
    const avgScore = results.length ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length) : 0;
    const maxAttempts = exam.maxAttempts || 1;

    const statusBadge = {
      live: '<span class="badge badge-danger badge-dot live">LIVE</span>',
      upcoming: '<span class="badge badge-info">Upcoming</span>',
      ended: '<span class="badge badge-success">Ended</span>',
    };

    return `
      <div class="manage-exam-card">
        <div class="card-header">
          <div>
            <h3 style="font-size:1.1rem;margin-bottom:4px">${exam.title}</h3>
            <span class="badge badge-primary" style="font-size:0.7rem">${exam.subject}</span>
          </div>
          ${statusBadge[status]}
        </div>
        <div class="card-body">
          <div class="card-meta">
            <span><i class="fa-solid fa-play" style="color:var(--accent)"></i> ${formatDate(exam.date)} ${formatTime(exam.time)}</span>
            <span><i class="fa-solid fa-flag-checkered" style="color:var(--danger)"></i> ${exam.endDate ? formatDate(exam.endDate) + ' ' + formatTime(exam.endTime) : 'Start + ' + exam.duration + 'm'}</span>
            <span><i class="fa-solid fa-hourglass-half"></i> ${exam.duration}m</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px">
            <div style="background:var(--bg-input);padding:10px;border-radius:var(--radius-sm);text-align:center">
              <div style="font-size:1.2rem;font-weight:700;color:var(--primary)">${exam.questions.length}</div>
              <div style="font-size:0.7rem;color:var(--text-tertiary)">Questions</div>
            </div>
            <div style="background:var(--bg-input);padding:10px;border-radius:var(--radius-sm);text-align:center">
              <div style="font-size:1.2rem;font-weight:700;color:var(--accent)">${avgScore}%</div>
              <div style="font-size:0.7rem;color:var(--text-tertiary)">Avg Score (${results.length})</div>
            </div>
            <div style="background:var(--bg-input);padding:10px;border-radius:var(--radius-sm);text-align:center">
              <div style="font-size:1.2rem;font-weight:700;color:var(--warning)">${maxAttempts}</div>
              <div style="font-size:0.7rem;color:var(--text-tertiary)">Max Attempts</div>
            </div>
          </div>
        </div>
        <div class="card-footer">
          <button class="btn btn-ghost btn-sm" onclick="editExam('${exam.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn btn-primary btn-sm" onclick="duplicateExam('${exam.id}')"><i class="fa-solid fa-copy"></i> Duplicate</button>
          <button class="btn btn-ghost btn-sm text-danger" onclick="deleteExam('${exam.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function deleteExam(id) {
  showConfirm('Delete Exam', 'Are you sure you want to delete this exam? All related results will be orphaned.', () => {
    ExamDB.delete(id);
    showToast('Exam deleted', 'info');
    renderManageExams();
  });
}

function editExam(id) {
  const exam = ExamDB.getById(id);
  if (!exam) return;

  editingExamId = id;
  builderQuestions = [...exam.questions];

  document.getElementById('build-title').value = exam.title;
  document.getElementById('build-subject').value = exam.subject;
  document.getElementById('build-pass').value = exam.passPercent || 50;
  document.getElementById('build-date').value = exam.date;
  document.getElementById('build-time').value = exam.time;
  document.getElementById('build-duration').value = exam.duration;
  document.getElementById('build-max-attempts').value = exam.maxAttempts || 1;
  document.getElementById('build-warning-limit').value = exam.warningLimit || 5;
  document.getElementById('build-shuffle').checked = exam.shuffle;
  document.getElementById('build-instructions').innerHTML = exam.instructions || '';

  // Load end date/time if saved, else compute from start + duration
  if (exam.endDate && exam.endTime) {
    document.getElementById('build-end-date').value = exam.endDate;
    document.getElementById('build-end-time').value = exam.endTime;
  } else {
    syncEndDateTime();
  }

  document.getElementById('builder-title').innerHTML = '<i class="fa-solid fa-pen" style="color:var(--warning)"></i> Edit Exam';

  builderStep(1);
  renderBuilderQuestions();

  // Switch to create tab
  document.querySelector('.sidebar-nav a[data-section="sec-create"]').click();
}

function duplicateExam(id) {
  const exam = ExamDB.getById(id);
  if (!exam) return;

  showConfirm('Duplicate Exam', `Duplicate "${exam.title}"? A copy will be created as upcoming.`, () => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const fmtT = (d) => d.toTimeString().slice(0, 5);

    ExamDB.create({
      ...exam,
      title: exam.title + ' (Copy)',
      date: fmt(tomorrow),
      time: fmtT(tomorrow),
      createdBy: currentUser.id,
      questions: [...exam.questions],
    });
    showToast('Exam duplicated! ✅', 'success');
    renderManageExams();
  });
}

// ─── Exam Builder Steps ───────────────────────────────────
function builderStep(step) {
  if (step === 2) {
    // Basic validation before allowing step 2
    if (!document.getElementById('build-title').value || !document.getElementById('build-date').value) {
      showToast('Please fill in title and date first', 'error');
      return;
    }
  }

  document.getElementById('builder-step-1').style.display = step === 1 ? 'block' : 'none';
  document.getElementById('builder-step-2').style.display = step === 2 ? 'block' : 'none';
  
  document.getElementById('builder-step-title').textContent = step === 1 ? 'Step 1: Exam Details' : 'Step 2: Questions';

  document.getElementById('builder-prev-btn').style.display = step === 2 ? 'block' : 'none';
  document.getElementById('builder-next-btn').style.display = step === 1 ? 'block' : 'none';
  document.getElementById('builder-save-btn').style.display = step === 2 ? 'block' : 'none';
}

// ─── Question Builder ─────────────────────────────────────
function addQuestionToBuilder() {
  const text = document.getElementById('add-q-text').value.trim();
  const opt0 = document.getElementById('add-q-opt0').value.trim();
  const opt1 = document.getElementById('add-q-opt1').value.trim();
  const opt2 = document.getElementById('add-q-opt2').value.trim();
  const opt3 = document.getElementById('add-q-opt3').value.trim();
  const correct = parseInt(document.getElementById('add-q-correct').value);
  const marks = parseInt(document.getElementById('add-q-marks').value);

  if (!text || !opt0 || !opt1 || !opt2 || !opt3) {
    showToast('Please fill all question text and option fields', 'error');
    return;
  }

  builderQuestions.push({
    id: 'q_' + Date.now(),
    text,
    options: [opt0, opt1, opt2, opt3],
    correct,
    marks
  });

  // Clear form
  document.getElementById('add-q-text').value = '';
  document.getElementById('add-q-opt0').value = '';
  document.getElementById('add-q-opt1').value = '';
  document.getElementById('add-q-opt2').value = '';
  document.getElementById('add-q-opt3').value = '';
  document.getElementById('add-q-correct').value = '0';

  renderBuilderQuestions();
  showToast('Question added', 'success');
}

function triggerBulkUpload() {
  document.getElementById('bulk-q-input').click();
}

function handleBulkUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    
    // Skip header if it exists
    const startIndex = lines[0].toLowerCase().includes('question') ? 1 : 0;
    let addedCount = 0;

    for (let i = startIndex; i < lines.length; i++) {
      // Basic CSV splitter (doesn't handle complex quoted CSV but good for simple bulk)
      const parts = lines[i].split(',').map(p => p.trim());
      if (parts.length >= 6) {
        const [qText, optA, optB, optC, optD, correctIdx, marks] = parts;
        const idx = parseInt(correctIdx);
        const m = parseInt(marks) || 1;

        if (qText && optA && optB && optC && optD && !isNaN(idx)) {
          builderQuestions.push({
            id: 'q_' + Date.now() + '_' + i,
            text: qText,
            options: [optA, optB, optC, optD],
            correct: idx,
            marks: m
          });
          addedCount++;
        }
      }
    }

    if (addedCount > 0) {
      renderBuilderQuestions();
      showToast(`Successfully uploaded ${addedCount} questions! 🎉`, 'success');
    } else {
      showToast('No valid questions found in file.', 'warning');
    }
    // Reset file input
    event.target.value = '';
  };
  reader.readAsText(file);
}

function downloadSampleCSV() {
  const csv = "Question,Option A,Option B,Option C,Option D,Correct Index (0-3),Marks\n" +
              '"What is the capital of France?","London","Paris","Berlin","Madrid",1,2\n' +
              '"Solve: 5 + 5 * 2","15","20","25","10",0,1\n' +
              '"Which gas do plants absorb?","Oxygen","Nitrogen","Carbon Dioxide","Helium",2,2';
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'NEXA_Bulk_Questions_Sample.csv';
  a.click();
}

function renderBuilderQuestions() {
  const container = document.getElementById('build-q-list');
  document.getElementById('build-q-count').textContent = builderQuestions.length;

  if (builderQuestions.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:30px"><p>No questions added yet.</p></div>';
    return;
  }

  const letters = ['A', 'B', 'C', 'D'];

  container.innerHTML = builderQuestions.map((q, i) => `
    <div class="question-item">
      <div class="question-item-header">
        <div class="question-item-number">Q${i + 1} <span class="q-marks">(${q.marks} mark${q.marks > 1 ? 's' : ''})</span></div>
        <div class="question-item-actions">
          <button type="button" class="delete" onclick="removeBuilderQuestion(${i})"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="q-text">${q.text}</div>
      <div class="q-options">
        ${q.options.map((opt, oIdx) => `
          <div class="q-option ${oIdx === q.correct ? 'correct' : ''}">
            <div class="opt-letter">${letters[oIdx]}</div>
            ${opt}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function removeBuilderQuestion(index) {
  builderQuestions.splice(index, 1);
  renderBuilderQuestions();
}

// ─── Save Exam ────────────────────────────────────────────
function handleSaveExam(e) {
  e.preventDefault();

  const title = document.getElementById('build-title').value.trim();
  const subject = document.getElementById('build-subject').value.trim();
  const date = document.getElementById('build-date').value;
  const time = document.getElementById('build-time').value;

  if (!title || !subject || !date || !time) {
    showToast('Please fill all required exam details in Step 1.', 'error');
    builderStep(1);
    return;
  }

  if (builderQuestions.length === 0) {
    showToast('Cannot save exam without questions', 'error');
    return;
  }

  // Auto-sync end date/time if blank
  syncEndDateTime();

  const maxAttemptsEl = document.getElementById('build-max-attempts');
  const examData = {
    title,
    subject,
    passPercent: parseInt(document.getElementById('build-pass').value),
    date,
    time,
    endDate: document.getElementById('build-end-date').value || null,
    endTime: document.getElementById('build-end-time').value || null,
    duration: parseInt(document.getElementById('build-duration').value),
    maxAttempts: maxAttemptsEl ? parseInt(maxAttemptsEl.value) || 1 : 1,
    warningLimit: parseInt(document.getElementById('build-warning-limit')?.value) || 5,
    shuffle: document.getElementById('build-shuffle').checked,
    instructions: document.getElementById('build-instructions').innerHTML,
    marksPerQ: 1,
    createdBy: currentUser.id,
    questions: [...builderQuestions],
    updatedAt: new Date().toISOString(),
  };

  if (editingExamId) {
    ExamDB.update(editingExamId, examData);
    showToast('Exam updated successfully! 🎉', 'success');
  } else {
    ExamDB.create(examData);
    showToast('Exam created successfully! 🎉', 'success');
  }

  // Reset
  editingExamId = null;
  builderQuestions = [];
  document.getElementById('exam-builder-form').reset();
  // Restore defaults after reset
  const maxAttEl = document.getElementById('build-max-attempts');
  if (maxAttEl) maxAttEl.value = '1';
  const warnLimEl = document.getElementById('build-warning-limit');
  if (warnLimEl) warnLimEl.value = '5';
  document.getElementById('build-pass').value = '50';
  document.getElementById('build-duration').value = '60';
  document.getElementById('build-shuffle').checked = true;
  document.getElementById('build-instructions').innerHTML = '<ul><li>Camera must be ON at all times.</li></ul>';
  document.getElementById('builder-title').innerHTML = '<i class="fa-solid fa-pen-to-square" style="color:var(--accent)"></i> Create New Exam';
  // Clear end datetime fields
  document.getElementById('build-end-date').value = '';
  document.getElementById('build-end-time').value = '';

  builderStep(1);
  renderBuilderQuestions();
  renderManageExams();

  // Go back to manage tab
  document.querySelector('.sidebar-nav a[data-section="sec-manage"]').click();
}

// ─── Exam Results (QM) ────────────────────────────────────

function renderResultsList() {
  let exams = ExamDB.getAll();
  if (currentUser.role === 'question_manager') {
    exams = ExamDB.getByCreator(currentUser.id);
  }

  const container = document.getElementById('qm-results-exam-list');
  const view1 = document.getElementById('qm-results-exam-view');
  const view2 = document.getElementById('qm-results-detail-view');
  
  view1.style.display = 'block';
  view2.style.display = 'none';

  if (exams.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No exams to show</h3></div>';
    return;
  }

  container.innerHTML = exams.map(exam => {
    const results = ResultDB.getAll().filter(r => r.examId === exam.id);
    const passCount = results.filter(r => r.passed).length;
    
    return `
    <div class="card result-exam-card" onclick="showExamResultsDetail('${exam.id}', '${exam.title}')" style="cursor:pointer">
      <div style="font-size:0.75rem; color:var(--primary); font-weight:700; text-transform:uppercase; margin-bottom:8px;">${exam.subject}</div>
      <h3 style="margin-bottom:12px;">${exam.title}</h3>
      <div class="flex-between" style="font-size:0.85rem; color:var(--text-secondary)">
        <span>Submissions: <strong>${results.length}</strong></span>
        <span>Passed: <strong style="color:var(--accent)">${passCount}</strong></span>
      </div>
      <button class="btn btn-ghost btn-sm w-full mt-3">View Results <i class="fa-solid fa-arrow-right"></i></button>
    </div>
    `;
  }).join('');
}

async function showExamResultsDetail(examId, title) {
  currentViewExamId = examId;
  document.getElementById('qm-results-exam-view').style.display = 'none';
  document.getElementById('qm-results-detail-view').style.display = 'block';
  document.getElementById('qm-detail-exam-title').textContent = title;

  const results = ResultDB.getAll().filter(r => r.examId === examId).sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  const recordings = await RecordingDB.fetchAll();
  const tbody = document.getElementById('qm-results-body');

  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px; color:var(--text-tertiary)">No student submissions yet.</td></tr>';
    return;
  }

  // Calculate attempt numbers chronologically
  const studentResults = {};
  [...results].sort((a,b) => new Date(a.submittedAt) - new Date(b.submittedAt)).forEach(r => {
    if (!studentResults[r.studentId]) studentResults[r.studentId] = [];
    studentResults[r.studentId].push(r.id || r.submittedAt);
  });

  tbody.innerHTML = results.map(r => {
    const studentAttempts = studentResults[r.studentId] || [];
    const attemptNr = studentAttempts.indexOf(r.id || r.submittedAt) + 1;
    const attemptBadge = `<span class="badge badge-info" style="font-weight:600; font-size:0.7rem; padding:3px 8px; border-radius:30px;">#${attemptNr}</span>`;

    const rec = recordings.find(re => re.studentId === r.studentId && re.examId === r.examId);
    let recCol = '<span style="color:var(--text-tertiary); font-size:0.8rem">N/A</span>';
    
    if (rec) {
      let recUrl = rec.serverUrl || rec.url;
      if (recUrl && recUrl.startsWith('/')) recUrl = CONFIG.API_BASE_URL + recUrl;

      recCol = `
        <div class="flex gap-xs">
          <button class="btn btn-secondary btn-sm" onclick="playQMRecording('${recUrl}', '${r.studentName}', '${r.examTitle}', '${rec.filename}')">
            <i class="fa-solid fa-play"></i> Play
          </button>
          <a href="${recUrl}" download="${rec.filename}" class="btn btn-secondary btn-sm" style="text-decoration:none">
            <i class="fa-solid fa-download"></i> Save
          </a>
        </div>
      `;
    }

    return `
      <tr>
        <td><div class="flex" style="align-items:center; gap:8px;"><strong>${r.studentName}</strong></div></td>
        <td>${attemptBadge}</td>
        <td style="font-weight:700; color:var(--primary)">${r.score}/${r.totalMarks}</td>
        <td>${r.percentage}%</td>
        <td><span class="badge ${r.passed ? 'badge-success' : 'badge-danger'}">${r.passed ? 'Passed' : 'Failed'}</span></td>
        <td><span class="badge ${r.warnings >= 2 ? 'badge-danger' : (r.warnings > 0 ? 'badge-warning' : 'badge-success')}">${r.warnings}</span></td>
        <td>${recCol}</td>
        <td>
          <button class="btn btn-ghost btn-sm" style="color:var(--primary)" onclick="downloadResultCard('${r.id}')">
            <i class="fa-solid fa-file-pdf"></i> Report
          </button>
        </td>
        <td style="font-size:0.8rem; color:var(--text-tertiary)">${formatDateTime(r.submittedAt)}</td>
    </tr>
    `;
  }).join('');
}

function showResultsExamList() {
  renderResultsList();
}

let currentViewExamId = null;

async function exportCurrentExamPDF() {
  if (!currentViewExamId) return;
  const exam = ExamDB.getById(currentViewExamId);
  if (!exam) return;
  
  const results = ResultDB.getAll().filter(r => r.examId === currentViewExamId);
  if (results.length === 0) { showToast('No results to export', 'warning'); return; }

  await exportExamSummaryPDF(exam);
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

function playQMRecording(url, studentName, examTitle, filename) {
  const modal = document.getElementById('recording-modal');
  const player = document.getElementById('recording-player');
  const title = document.getElementById('recording-modal-title');
  const downloadBtn = document.getElementById('recording-download-btn');

  title.innerHTML = `<i class="fa-solid fa-video"></i> ${studentName} - ${examTitle}`;
  player.src = url;
  
  if (downloadBtn) {
    downloadBtn.href = url;
    downloadBtn.download = filename || 'recording.webm';
  }

  modal.classList.add('show');
  player.play();
}

function closeQMRecording() {
  const modal = document.getElementById('recording-modal');
  const player = document.getElementById('recording-player');
  player.pause();
  player.src = '';
  modal.classList.remove('show');
}
