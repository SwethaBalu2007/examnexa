# NEXA — Smart Exam Monitoring System (Full Stack)

NEXA is a comprehensive, secure, and AI-powered online examination system. It features real-time face detection, strict anti-cheating mechanisms, and robust analytics.

---

## 🚀 Getting Started (IMPORTANT)

To run NEXA with all features (Recordings, Email OTP, Admin Monitoring), you **must** start the backend server.

### 🪟 Windows (Easiest)
1. Double-click the **`run_nexa.bat`** file in the root directory.
2. It will install dependencies (if missing) and start the server.
3. Once the server is running, visit: **[http://localhost:8080](http://localhost:8080)**

### 💻 Manual Startup (Any OS)
1. Open terminal in the `backend` folder.
2. Run `npm install` (only the first time).
3. Run `npm start` or `node simple_server.js`.
4. Open **[http://localhost:8080](http://localhost:8080)** in your browser.

---

## 🔐 Default Test Accounts

Use these pre-seeded credentials for testing:

| Role | Email | Password |
| :--- | :--- | :--- |
| **Administrator** | `admin@nexa.com` | `admin123` |
| **Question Manager** | `qm@nexa.com` | `qm123` |
| **Student** | `arjun@nexa.com` | `student123` |

---

## 🛠️ Key Features (Updated)
- **Node.js Backend**: Handles exam recordings (video + audio), email OTPs, and serves the frontend.
- **Mandatory Fullscreen**: Students are forced into fullscreen mode during exams to prevent desktop navigation.
- **AI Proctoring**: Real-time face detection and noise-cancelled recordings.
- **Anti-Cheat System**: Prevents tab switching, keyboard shortcuts, and right-clicks.
- **Admin Hub**: Real-time proctoring grid and PDF/CSV result exports.

---

## 📂 Project Structure
- `/backend/`: Node.js server, email logic, and recording storage.
- `/frontend/`: UI files (HTML, CSS, JS).
  - `/frontend/index.html`: Landing page and Auth center.
  - `/frontend/admin.html`: Admin monitoring dashboard.
  - `/frontend/student.html`: Student portal and secure exam module.
  - `/frontend/js/`: Core logic (AI, Storage, Auth, Fullscreen).

---

## 🛡️ Requirements
- Node.js (v16+) installed.
- Modern browser (Chrome/Edge/Firefox) with Camera/Mic permissions.
