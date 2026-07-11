// ============================================================
// NEXA Storage Layer — Centralized localStorage helpers + seed data
// ============================================================

const KEYS = {
  USERS: 'nexa_users',
  CURRENT_USER: 'nexa_current_user',
  EXAMS: 'nexa_exams',
  RESULTS: 'nexa_results',
  WARNINGS: 'nexa_warnings',
  ACTIVE_EXAMS: 'nexa_active_exams',
  NOTIFICATIONS: 'nexa_notifications',
  SETTINGS: 'nexa_settings',
  THEME: 'nexa_theme',
  RECORDINGS: 'nexa_recordings',
};

// ─── Cloud Sync Engine ─────────────────────────────────────
const Sync = {
  isSyncing: false,

  // Smart merge: pull from server but NEVER wipe local-only records.
  // For array keys we union by 'id', so a newly registered user that
  // the server hasn't persisted yet is NOT lost after a server restart.
  pullAll: async () => {
    if (!CONFIG.API_BASE_URL) return;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      let res;
      try {
        res = await fetch(CONFIG.API_BASE_URL + '/api/cloud-sync', { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      const result = await res.json();
      if (result.success && result.data) {

        // Keys that are arrays of objects with an 'id' field — merge by id
        const MERGE_KEYS = [
          'nexa_users', 'nexa_exams', 'nexa_results',
          'nexa_warnings', 'nexa_notifications', 'nexa_recordings',
        ];

        Object.keys(result.data).forEach(key => {
          // Session is always local-only
          if (key === KEYS.CURRENT_USER) return;

          const serverVal = result.data[key];
          const localRaw = localStorage.getItem(key);
          const localVal = localRaw ? JSON.parse(localRaw) : null;

          if (MERGE_KEYS.includes(key) && Array.isArray(serverVal) && Array.isArray(localVal)) {
            // Merge: start with server data, then add any local records not on server
            const serverIds = new Set(serverVal.map(r => r.id));
            const localOnly = localVal.filter(r => !serverIds.has(r.id));
            const merged = [...serverVal, ...localOnly];
            localStorage.setItem(key, JSON.stringify(merged));
          } else if (MERGE_KEYS.includes(key) && Array.isArray(localVal) && (!Array.isArray(serverVal) || serverVal.length === 0)) {
            // Server returned empty array but we have local data → keep local
            console.log(`☁️ Cloud Sync: Server returned empty ${key}, keeping local data.`);
          } else {
            // For non-array keys (settings, etc.) server wins
            localStorage.setItem(key, JSON.stringify(serverVal));
          }
        });

        console.log('☁️ Cloud Sync: Smart merge complete.');
        window.dispatchEvent(new CustomEvent('nexa:storage', { detail: { sync: true } }));
      }
    } catch (e) {
      console.warn('☁️ Cloud Sync: Failed to fetch from server. Local data preserved.', e.message);
    }
  },

  // Push specific key to server (with one retry on failure)
  // NOTE: nexa_current_user is a client-only session key — NEVER push it to server.
  push: async (key, data) => {
    if (!CONFIG.API_BASE_URL) return;
    if (key === KEYS.CURRENT_USER) return; // Session is always local-only
    const attempt = async () => {
      const res = await fetch(CONFIG.API_BASE_URL + '/api/cloud-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, data })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    };
    try {
      await attempt();
    } catch (e) {
      // Retry once after a short delay (handles server cold-start)
      try {
        await new Promise(r => setTimeout(r, 2000));
        await attempt();
        console.log(`☁️ Cloud Sync: Retry succeeded for ${key}`);
      } catch (e2) {
        console.warn(`☁️ Cloud Sync: Failed to push ${key} (will sync on next load).`);
      }
    }
  }
};


// ─── Generic Helpers ───────────────────────────────────────
const Storage = {
  get: (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set: (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    
    // Background Sync to Cloud
    Sync.push(key, value);
    
    // Dispatch custom event so same-tab listeners can react
    window.dispatchEvent(new CustomEvent('nexa:storage', { detail: { key } }));
  },
  remove: (key) => {
    localStorage.removeItem(key);
    Sync.push(key, null); // Sync deletion
  },
  clear: () => Object.values(KEYS).forEach(k => {
    localStorage.removeItem(k);
    Sync.push(k, null);
  }),
};

// ─── User CRUD ─────────────────────────────────────────────
const UserDB = {
  getAll: () => Storage.get(KEYS.USERS) || [],
  getById: (id) => UserDB.getAll().find(u => u.id === id) || null,
  getByEmail: (email) => UserDB.getAll().find(u => u.email.toLowerCase() === email.toLowerCase()) || null,

  create: (userData) => {
    const users = UserDB.getAll();
    const newUser = {
      id: generateId('usr'),
      ...userData,
      createdAt: new Date().toISOString(),
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userData.name)}&backgroundColor=6C63FF`,
    };
    users.push(newUser);
    Storage.set(KEYS.USERS, users);
    return newUser;
  },

  update: (id, updates) => {
    const users = UserDB.getAll().map(u => u.id === id ? { ...u, ...updates } : u);
    Storage.set(KEYS.USERS, users);
    return users.find(u => u.id === id);
  },

  delete: (id) => {
    const users = UserDB.getAll().filter(u => u.id !== id);
    Storage.set(KEYS.USERS, users);
  },
};

// ─── Session ───────────────────────────────────────────────
const Session = {
  get: () => Storage.get(KEYS.CURRENT_USER),
  set: (user) => Storage.set(KEYS.CURRENT_USER, user),
  clear: () => Storage.remove(KEYS.CURRENT_USER),
  isLoggedIn: () => !!Storage.get(KEYS.CURRENT_USER),
  getRole: () => Session.get()?.role || null,
};

// ─── Exam CRUD ─────────────────────────────────────────────
const ExamDB = {
  getAll: () => Storage.get(KEYS.EXAMS) || [],
  getById: (id) => ExamDB.getAll().find(e => e.id === id) || null,
  getByCreator: (creatorId) => ExamDB.getAll().filter(e => e.createdBy === creatorId),

  getStatus: (exam) => {
    const now = new Date();
    const start = parseDateTime(exam.date, exam.time);
    // Use explicitly saved endDate/endTime if available, else compute from duration
    const end = (exam.endDate && exam.endTime)
      ? parseDateTime(exam.endDate, exam.endTime)
      : new Date(start.getTime() + (exam.duration || 60) * 60000);
    if (now < start) return 'upcoming';
    if (now >= start && now <= end) return 'live';
    return 'ended';
  },

  create: (examData) => {
    const exams = ExamDB.getAll();
    const newExam = {
      id: generateId('exam'),
      ...examData,
      questions: examData.questions || [],
      createdAt: new Date().toISOString(),
      status: 'upcoming',
    };
    exams.push(newExam);
    Storage.set(KEYS.EXAMS, exams);
    NotificationDB.add(`New exam created: "${newExam.title}"`, 'info', 'all');
    return newExam;
  },

  update: (id, updates) => {
    const exams = ExamDB.getAll().map(e => e.id === id ? { ...e, ...updates } : e);
    Storage.set(KEYS.EXAMS, exams);
    return exams.find(e => e.id === id);
  },

  delete: (id) => {
    const exams = ExamDB.getAll().filter(e => e.id !== id);
    Storage.set(KEYS.EXAMS, exams);
  },
};

// ─── Results CRUD ──────────────────────────────────────────
const ResultDB = {
  getAll: () => Storage.get(KEYS.RESULTS) || [],
  getById: (id) => ResultDB.getAll().find(r => r.id === id) || null,
  getByStudent: (studentId) => ResultDB.getAll().filter(r => r.studentId === studentId),
  getByExam: (examId) => ResultDB.getAll().filter(r => r.examId === examId),
  getByStudentAndExam: (studentId, examId) => ResultDB.getAll().find(r => r.studentId === studentId && r.examId === examId) || null,

  create: (resultData) => {
    const results = ResultDB.getAll();
    const newResult = {
      id: generateId('res'),
      ...resultData,
      submittedAt: new Date().toISOString(),
    };
    results.push(newResult);
    Storage.set(KEYS.RESULTS, results);
    const status = newResult.passed ? '✅ PASSED' : '❌ FAILED';
    // Admin sees full result notification; student sees a personalised one
    NotificationDB.add(`${newResult.studentName} ${status} "${newResult.examTitle}" — ${newResult.percentage}%`, newResult.passed ? 'success' : 'warning', 'admin');
    NotificationDB.add(`You ${status} "${newResult.examTitle}" — ${newResult.percentage}%`, newResult.passed ? 'success' : 'warning', newResult.studentId);
    return newResult;
  },
};

// ─── Warnings CRUD ─────────────────────────────────────────
const WarningDB = {
  getAll: () => Storage.get(KEYS.WARNINGS) || [],
  getByStudent: (studentId) => WarningDB.getAll().filter(w => w.studentId === studentId),
  getByStudentAndExam: (studentId, examId) => WarningDB.getAll().filter(w => w.studentId === studentId && w.examId === examId),

  add: (studentId, examId, type, description) => {
    const warnings = WarningDB.getAll();
    const newWarning = {
      id: generateId('wrn'),
      studentId,
      examId,
      type, // 'face_absent' | 'camera_off' | 'keyboard' | 'tab_switch' | 'right_click' | 'copy_paste'
      description,
      timestamp: new Date().toISOString(),
    };
    warnings.push(newWarning);
    Storage.set(KEYS.WARNINGS, warnings);

    // Update active exam warning count
    const active = ActiveExamDB.getByStudent(studentId);
    if (active) {
      ActiveExamDB.update(studentId, { warnings: (active.warnings || 0) + 1 });
    }

    // Notify admin and the specific student
    const user = UserDB.getById(studentId);
    NotificationDB.add(`⚠️ Warning! ${user?.name || 'Student'}: ${description}`, 'warning', 'admin');
    NotificationDB.add(`⚠️ Warning: ${description}`, 'warning', studentId);
    return newWarning;
  },

  countByStudentAndExam: (studentId, examId) =>
    WarningDB.getByStudentAndExam(studentId, examId).length,
};

// ─── Active Exam Tracking ──────────────────────────────────
const ActiveExamDB = {
  getAll: () => Storage.get(KEYS.ACTIVE_EXAMS) || [],
  getByStudent: (studentId) => ActiveExamDB.getAll().find(a => a.studentId === studentId) || null,

  start: (studentId, examId, studentName, examTitle) => {
    const active = ActiveExamDB.getAll().filter(a => a.studentId !== studentId);
    const entry = {
      studentId, examId, studentName, examTitle,
      currentQuestion: 0,
      answers: {},
      warnings: 0,
      startedAt: new Date().toISOString(),
      status: 'active', // 'active' | 'completed' | 'auto_submitted'
    };
    active.push(entry);
    Storage.set(KEYS.ACTIVE_EXAMS, active);
    return entry;
  },

  update: (studentId, updates) => {
    const active = ActiveExamDB.getAll().map(a => a.studentId === studentId ? { ...a, ...updates } : a);
    Storage.set(KEYS.ACTIVE_EXAMS, active);
  },

  end: (studentId) => {
    const active = ActiveExamDB.getAll().filter(a => a.studentId !== studentId);
    Storage.set(KEYS.ACTIVE_EXAMS, active);
  },
};

// ─── Notifications ─────────────────────────────────────────
const NotificationDB = {
  getAll: () => Storage.get(KEYS.NOTIFICATIONS) || [],

  // Admin sees everything
  getForAdmin: () => NotificationDB.getAll(),

  // Student sees only their own or 'all' audience notifications
  getForStudent: (studentId) =>
    NotificationDB.getAll().filter(n => n.target === 'all' || n.target === studentId),

  getUnread: () => NotificationDB.getAll().filter(n => !n.read),
  getUnreadForAdmin: () => NotificationDB.getForAdmin().filter(n => !n.read),
  getUnreadForStudent: (studentId) => NotificationDB.getForStudent(studentId).filter(n => !n.read),

  // target: 'admin' | 'all' | '<studentId>'
  add: (message, type = 'info', target = 'admin') => {
    const notifs = NotificationDB.getAll();
    notifs.unshift({
      id: generateId('notif'),
      message,
      type, // 'info' | 'warning' | 'success' | 'error'
      target, // 'admin' = admin only | 'all' = everyone | studentId = that student
      timestamp: new Date().toISOString(),
      read: false,
    });
    // Keep max 100 notifications
    Storage.set(KEYS.NOTIFICATIONS, notifs.slice(0, 100));
    window.dispatchEvent(new CustomEvent('nexa:notification'));
  },

  markRead: (id) => {
    const notifs = NotificationDB.getAll().map(n => n.id === id ? { ...n, read: true } : n);
    Storage.set(KEYS.NOTIFICATIONS, notifs);
  },

  markAllRead: () => {
    const notifs = NotificationDB.getAll().map(n => ({ ...n, read: true }));
    Storage.set(KEYS.NOTIFICATIONS, notifs);
  },

  markAllReadForStudent: (studentId) => {
    const notifs = NotificationDB.getAll().map(n =>
      (n.target === 'all' || n.target === studentId) ? { ...n, read: true } : n
    );
    Storage.set(KEYS.NOTIFICATIONS, notifs);
  },
};

// ─── Settings ──────────────────────────────────────────────
const SettingsDB = {
  get: () => Storage.get(KEYS.SETTINGS) || { maxWarnings: 3, gracePeriod: 15 },
  set: (updates) => Storage.set(KEYS.SETTINGS, { ...SettingsDB.get(), ...updates }),
};

// ─── Recording Metadata ────────────────────────────────────
// Stores server-side recording references (URL, size, timestamps)
const RecordingDB = {
  getAll: () => Storage.get(KEYS.RECORDINGS) || [],
  getByStudent: (studentId) => RecordingDB.getAll().filter(r => r.studentId === studentId),
  getByExam: (examId) => RecordingDB.getAll().filter(r => r.examId === examId),
  getByStudentAndExam: (studentId, examId) =>
    RecordingDB.getAll().filter(r => r.studentId === studentId && r.examId === examId),

  fetchAll: async () => {
    try {
      const res = await fetch(CONFIG.API_BASE_URL + '/api/recordings/list');
      const data = await res.json();
      if (data.success) {
        Storage.set(KEYS.RECORDINGS, data.recordings);
        return data.recordings;
      }
    } catch (e) {
      console.warn('Failed to fetch recordings from server', e);
    }
    return RecordingDB.getAll();
  },

  getForExam: async (examId) => {
    const all = await RecordingDB.fetchAll();
    return all.filter(r => r.examId === examId);
  },

  save: (studentId, examId, studentName, examTitle, serverUrl, filename, sizeKB) => {
    const recs = RecordingDB.getAll();
    const entry = {
      id: generateId('rec'),
      studentId, examId, studentName, examTitle,
      serverUrl, 
      url: serverUrl, // Legacy support
      filename, sizeKB,
      recordedAt: new Date().toISOString(),
    };
    recs.unshift(entry);
    Storage.set(KEYS.RECORDINGS, recs.slice(0, 500)); // keep max 500 entries
    return entry;
  },

  delete: (id) => {
    const recs = RecordingDB.getAll().filter(r => r.id !== id);
    Storage.set(KEYS.RECORDINGS, recs);
  },
};

// ─── ID Generator ──────────────────────────────────────────
function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ─── Date Parsing Helper ───────────────────────────────────
function parseDateTime(dateStr, timeStr) {
  try {
    // Check if both parts exist; if not, return current date/time to avoid crash
    if (!dateStr || !timeStr) {
      console.warn('[Storage] parseDateTime: missing date or time. Falling back to current time.');
      return new Date();
    }
    
    // Support for both "YYYY-MM-DD" and "HH:MM"
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hr, min] = timeStr.split(':').map(Number);
    
    const date = new Date(y, m - 1, d, hr, min, 0);
    // Final check for "Invalid Date"
    return isNaN(date.getTime()) ? new Date() : date;
  } catch (err) {
    console.warn('[Storage] parseDateTime error. Falling back to current time:', err);
    return new Date();
  }
}

// ─── Seed Demo Data ────────────────────────────────────────
function seedDemoData() {
  // Only seed if the admin account is missing (ensures demo access is always available)
  if (UserDB.getByEmail('admin@nexa.com')) return;

  // Demo users
  const admin = UserDB.create({ name: 'Super Admin', email: 'admin@nexa.com', password: 'admin123', role: 'admin' });
  const qm = UserDB.create({ name: 'Dr. Priya Sharma', email: 'qm@nexa.com', password: 'qm123', role: 'question_manager' });
  const s1 = UserDB.create({ name: 'Arjun Mehra', email: 'arjun@nexa.com', password: 'student123', role: 'student' });
  const s2 = UserDB.create({ name: 'Sneha Patel', email: 'sneha@nexa.com', password: 'student123', role: 'student' });
  const s3 = UserDB.create({ name: 'Rahul Kumar', email: 'rahul@nexa.com', password: 'student123', role: 'student' });
  const s4 = UserDB.create({ name: 'Meena Joshi', email: 'meena@nexa.com', password: 'student123', role: 'student' });
  const s5 = UserDB.create({ name: 'Vikram Singh', email: 'vikram@nexa.com', password: 'student123', role: 'student' });

  const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const now2 = new Date();

  const fmt2 = (d) => d.toISOString().slice(0,10);
  const fmtT2 = (d) => d.toTimeString().slice(0,5);

  // Ended exam
  const exam1 = ExamDB.create({
    title: 'Mathematics Fundamentals',
    subject: 'Mathematics',
    date: fmt2(pastDate),
    time: '09:00',
    duration: 60,
    maxAttempts: 1,
    marksPerQ: 2,
    passPercent: 50,
    shuffle: true,
    createdBy: qm.id,
    instructions: `<ul>
      <li>Ensure your camera is ON and face clearly visible throughout the exam.</li>
      <li>Sit in a well-lit, quiet room.</li>
      <li>No tab switching or use of other applications.</li>
      <li>Formal attire is mandatory.</li>
      <li>No calculators or reference material allowed.</li>
      <li>Any violation will result in an automatic warning.</li>
      <li>Three warnings will result in automatic exam submission.</li>
    </ul>`,
    questions: [
      { id: 'q1', text: 'What is 15 × 12?', options: ['160', '180', '175', '190'], correct: 1, marks: 2 },
      { id: 'q2', text: 'Solve: 2x + 5 = 13. Find x.', options: ['3', '4', '5', '6'], correct: 1, marks: 2 },
      { id: 'q3', text: 'What is the square root of 144?', options: ['11', '12', '13', '14'], correct: 1, marks: 2 },
      { id: 'q4', text: 'If a triangle has angles 60°, 60°, what is the third angle?', options: ['60°', '70°', '80°', '90°'], correct: 0, marks: 2 },
      { id: 'q5', text: 'What is 25% of 200?', options: ['40', '50', '60', '25'], correct: 1, marks: 2 },
    ],
  });

  // Upcoming exam
  const exam2 = ExamDB.create({
    title: 'Science & Technology',
    subject: 'Science',
    date: fmt2(futureDate),
    time: '10:00',
    duration: 45,
    maxAttempts: 2,
    marksPerQ: 3,
    passPercent: 60,
    shuffle: false,
    createdBy: qm.id,
    instructions: `<ul>
      <li>Camera must be ON throughout the exam.</li>
      <li>Do not leave the exam window.</li>
      <li>Only one attempt at a time allowed.</li>
      <li>Read each question carefully before answering.</li>
    </ul>`,
    questions: [
      { id: 'q1', text: 'What is the unit of electric current?', options: ['Volt', 'Ohm', 'Ampere', 'Watt'], correct: 2, marks: 3 },
      { id: 'q2', text: 'Which planet is closest to the Sun?', options: ['Venus', 'Earth', 'Mercury', 'Mars'], correct: 2, marks: 3 },
      { id: 'q3', text: 'What is the chemical symbol for Gold?', options: ['Go', 'Gd', 'Au', 'Ag'], correct: 2, marks: 3 },
      { id: 'q4', text: 'Speed of light is approximately?', options: ['3×10⁸ m/s', '3×10⁶ m/s', '3×10¹⁰ m/s', '3×10⁴ m/s'], correct: 0, marks: 3 },
      { id: 'q5', text: 'DNA stands for?', options: ['Deoxyribose Nucleic Acid', 'Dinucleic Acid', 'Deoxyribonucleic Acid', 'Diribose Acid'], correct: 2, marks: 3 },
    ],
  });

  // Live exam (now)
  const liveStart = new Date(Date.now() - 10 * 60 * 1000); // started 10 mins ago
  const exam3 = ExamDB.create({
    title: 'English Comprehension',
    subject: 'English',
    date: fmt2(liveStart),
    time: fmtT2(liveStart),
    duration: 30,
    maxAttempts: 1,
    marksPerQ: 1,
    passPercent: 40,
    shuffle: true,
    createdBy: qm.id,
    instructions: `<ul>
      <li>Read all passages carefully.</li>
      <li>Camera ON at all times.</li>
      <li>No dictionaries or external help allowed.</li>
    </ul>`,
    questions: [
      { id: 'q1', text: 'The synonym of "Benevolent" is:', options: ['Cruel', 'Kind', 'Angry', 'Fearful'], correct: 1, marks: 1 },
      { id: 'q2', text: 'Choose the correct form: "Neither he nor she ___ ready."', options: ['are', 'is', 'were', 'be'], correct: 1, marks: 1 },
      { id: 'q3', text: 'The antonym of "Eloquent" is:', options: ['Fluent', 'Articulate', 'Inarticulate', 'Verbose'], correct: 2, marks: 1 },
      { id: 'q4', text: '"Break a leg" is an example of:', options: ['Simile', 'Metaphor', 'Idiom', 'Alliteration'], correct: 2, marks: 1 },
    ],
  });

  // Seed some results for Arjun
  ResultDB.create({
    studentId: s1.id, studentName: s1.name,
    examId: exam1.id, examTitle: exam1.title,
    score: 8, totalMarks: 10,
    percentage: 80, passed: true,
    warnings: 1,
    answers: { q1: 1, q2: 1, q3: 1, q4: 0, q5: 0 },
  });

  // Active exams (students in exam3)
  [s2, s3, s4, s5].forEach((s, i) => {
    ActiveExamDB.start(s.id, exam3.id, s.name, exam3.title);
    ActiveExamDB.update(s.id, { warnings: i, currentQuestion: i + 1 });
  });

  // Seed some warnings
  WarningDB.add(s3.id, exam3.id, 'tab_switch', 'Student switched browser tab');
  WarningDB.add(s4.id, exam3.id, 'face_absent', 'Face not detected for 15 seconds');
  WarningDB.add(s4.id, exam3.id, 'keyboard', 'Ctrl+C detected');
  WarningDB.add(s5.id, exam3.id, 'camera_off', 'Camera was turned off');

  // Notifications
  NotificationDB.add('Welcome to NEXA Exam Monitoring System! 🎓', 'info', 'all');
  NotificationDB.add(`Exam "${exam3.title}" is now LIVE with 4 students active`, 'info', 'admin');
  NotificationDB.add(`⚠️ ${s4.name} has 2 warnings in English Comprehension`, 'warning', 'admin');
}

// ─── Initialize on load ────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // 1. First try to pull latest cloud data
  await Sync.pullAll();

  // 2. Migrate legacy notifications that have no 'target' field
  //    (they were admin-level by default, so set target = 'admin')
  const rawNotifs = Storage.get(KEYS.NOTIFICATIONS) || [];
  const needsMigration = rawNotifs.some(n => !n.target);
  if (needsMigration) {
    const migrated = rawNotifs.map(n => n.target ? n : { ...n, target: 'admin' });
    localStorage.setItem(KEYS.NOTIFICATIONS, JSON.stringify(migrated));
  }

  // 3. Then seed if still empty (ensures demo access)
  seedDemoData();
});
