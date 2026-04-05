// ============================================================
// NEXA ExamRecorder — Records video+audio, uploads to server
// ============================================================

const ExamRecorder = {
  mediaRecorder: null,
  audioRecorder: null,
  chunks: [],
  audioChunks: [],
  recording: false,
  _studentId: null,
  _examId: null,
  _studentName: null,
  _examTitle: null,

  isSupported() {
    return !!(window.MediaRecorder && navigator.mediaDevices);
  },

  start(stream, studentId, examId, studentName, examTitle) {
    if (!this.isSupported()) return false;
    if (this.recording) return false;

    this._studentId = studentId;
    this._examId = examId;
    this._studentName = studentName;
    this._examTitle = examTitle;
    this.chunks = [];
    this.audioChunks = [];

    // MIME for main recording (video + audio)
    const mimeTypes = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
    const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    // MIME for standalone audio
    const audioMimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    const audioMime = audioMimes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    try {
      // 1. Main Recorder (Video + Audio)
      this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      this.mediaRecorder.onerror = (e) => console.error('[ExamRecorder] Video Error:', e);
      
      // 2. Audio-only Recorder (Extract ONLY audio tracks for a clean file)
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const audioStream = new MediaStream(audioTracks);
        this.audioRecorder = new MediaRecorder(audioStream, audioMime ? { mimeType: audioMime } : {});
        this.audioRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
        };
        this.audioRecorder.onerror = (e) => console.error('[ExamRecorder] Audio Error:', e);
      }

      this.mediaRecorder.start(3000);
      if (this.audioRecorder) this.audioRecorder.start(3000);
      
      this.recording = true;
      console.log(`[ExamRecorder] Dual recording started (Video: ${mimeType}, Audio: ${audioMime || 'None'})`);
      return true;
    } catch (err) {
      console.error('ExamRecorder: Failed to start MediaRecorder:', err);
      return false;
    }
  },

  stop() {
    return new Promise((resolve) => {
      if (!this.recording || !this.mediaRecorder) {
        resolve(null);
        return;
      }

      let videoBlob = null;
      let audioBlob = null;
      let stopCount = 0;
      const expectedStops = this.audioRecorder ? 2 : 1;

      const checkFinish = async () => {
        stopCount++;
        if (stopCount < expectedStops) return;

        this.recording = false;
        const sizeKB = Math.round(videoBlob.size / 1024);
        const result = await this._upload(videoBlob, audioBlob, sizeKB);
        resolve(result);
      };

      this.mediaRecorder.onstop = () => {
        videoBlob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType || 'video/webm' });
        this.chunks = [];
        checkFinish();
      };

      if (this.audioRecorder) {
        this.audioRecorder.onstop = () => {
          audioBlob = new Blob(this.audioChunks, { type: this.audioRecorder.mimeType || 'audio/webm' });
          this.audioChunks = [];
          checkFinish();
        };
        this.audioRecorder.stop();
      }
      this.mediaRecorder.stop();
    });
  },

  async _upload(videoBlob, audioBlob, sizeKB) {
    try {
      const formData = new FormData();
      formData.append('studentId', this._studentId);
      formData.append('examId', this._examId);
      formData.append('studentName', this._studentName || '');
      formData.append('examTitle', this._examTitle || '');
      
      const ts = Date.now();
      formData.append('recording', videoBlob, `${this._examId}_${ts}.webm`);
      if (audioBlob) {
        formData.append('audio', audioBlob, `${this._examId}_${ts}.audio.webm`);
      }

      const response = await fetch(CONFIG.API_BASE_URL + '/api/upload-recording', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data.success) {
        console.log(`[ExamRecorder] Dual upload success → Video: ${data.serverUrl}, Audio: ${data.audioUrl}`);
        return { 
          success: true, 
          url: data.serverUrl, // Standard field for frontend
          audioUrl: data.audioUrl,
          filename: data.filename, 
          sizeKB: data.sizeKB 
        };
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      console.error('[ExamRecorder] Upload failed:', err);
      return { success: false, error: err.message, sizeKB };
    }
  },

  async fetchList(params = {}) {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(CONFIG.API_BASE_URL + `/api/recordings/list${qs ? '?' + qs : ''}`);
      const data = await res.json();
      return data.success ? data.recordings : [];
    } catch (_) {
      return [];
    }
  },

  abort() {
    if (this.recording) {
      if (this.mediaRecorder) { this.mediaRecorder.onstop = null; this.mediaRecorder.stop(); }
      if (this.audioRecorder) { this.audioRecorder.onstop = null; this.audioRecorder.stop(); }
    }
    this.recording = false;
    this.chunks = [];
    this.audioChunks = [];
  },
};
