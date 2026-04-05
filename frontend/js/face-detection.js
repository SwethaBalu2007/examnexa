// ============================================================
// NEXA Face Detection — Camera + Face Monitoring + Grace Timer
// Uses face-api.js TinyFaceDetector (lightweight, fast)
// ============================================================

const FaceMonitor = {
  // State
  stream: null,
  videoEl: null,
  canvasEl: null,
  detecting: false,
  modelsLoaded: false,
  facePresent: false,
  cameraBlocked: false,
  _initialGraceDone: false,

  // Camera/Stream logic
  processedStream: null,

  // Grace timer
  graceTimerActive: false,
  graceCountdown: 15,
  graceInterval: null,
  GRACE_SECONDS: 15,

  // Consecutive miss counter for instant warning
  consecutiveMisses: 0,
  INSTANT_WARNING_THRESHOLD: 5, // ~2.5s of consecutive misses

  // Black frame detection
  _blackFrameCount: 0,
  BLACK_FRAME_THRESHOLD: 3,

  // Detection frame counter (for initial grace period)
  _detectionFrameCount: 0,
  INITIAL_GRACE_FRAMES: 10, // Skip first 10 frames (~5s) to let user position

  // Callbacks
  onWarning: null,            // (type, description) => void
  onGraceStart: null,         // (seconds, reason) => void
  onGraceTick: null,          // (secondsLeft) => void
  onGraceEnd: null,           // () => void
  onFaceStatusChange: null,   // (present: boolean) => void
  onCameraReady: null,        // () => void
  onImmediateWarning: null,   // (reason: string) => void — instant UI flash

  // ─── Initialize ─────────────────────────────────────────
  async init(videoElementId, canvasElementId, callbacks = {}) {
    this.videoEl = document.getElementById(videoElementId);
    this.canvasEl = document.getElementById(canvasElementId);
    Object.assign(this, callbacks);

    if (!window.faceapi) {
      console.warn('[NEXA] Face-api library not loaded! Face detection will be disabled.');
      this.modelsLoaded = false;
      return true;
    }

    if (!this.videoEl) {
      console.error('FaceMonitor: video element not found');
      return false;
    }

    // Load TinyFaceDetector model (lightweight, fast)
    try {
      console.log('[NEXA] Initializing face detection engine...');
      const MODEL_URL = 'https://vladmandic.github.io/face-api/model/';
      
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      
      this.modelsLoaded = true;
      console.log('%c NEXA Face Detection Engine: ONLINE ', 'background: #2ed573; color: #fff; font-weight: bold; padding: 6px 12px; border-radius: 4px;');
    } catch (err) {
      console.error('[NEXA] Face detection model failed to load:', err);
      this.modelsLoaded = false;
    }

    return true;
  },

  // ─── Start Camera ───────────────────────────────────────
  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      this.videoEl.srcObject = this.stream;
      await this.videoEl.play();
      
      // Setup Audio Processing
      await this._setupAudioProcessing();
      
      this.cameraBlocked = false;

      // Monitor track ended (camera disconnected/blocked)
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          this._handleCameraOff('Camera was disconnected');
        });
        this._cameraCheckInterval = setInterval(() => {
          if (videoTrack.muted || videoTrack.readyState === 'ended' || !videoTrack.enabled) {
            this._handleCameraOff('Camera was turned off or blocked');
          }
        }, 800);
      }

      this._startBlackFrameDetection();
      if (this.onCameraReady) this.onCameraReady();
      return true;
    } catch (err) {
      console.warn('FaceMonitor: Audio denied, falling back to video-only:', err.message);
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
          audio: false,
        });
        this.videoEl.srcObject = this.stream;
        await this.videoEl.play();
        this.cameraBlocked = false;
        this.processedStream = this.stream;
        this._startBlackFrameDetection();
        if (this.onCameraReady) this.onCameraReady();
        return true;
      } catch (err2) {
        console.error('FaceMonitor: Camera access denied', err2);
        return false;
      }
    }
  },

  async _setupAudioProcessing() {
    try {
      const audioTracks = this.stream.getAudioTracks();
      if (audioTracks.length === 0) {
        this.processedStream = this.stream;
        return;
      }

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(this.stream);
      const destination = audioCtx.createMediaStreamDestination();

      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // High-Pass Filter (cut < 150Hz — fan/AC hum)
      const hpFilter = audioCtx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.value = 150;

      // Vocal Boost (1kHz - 4kHz)
      const vocalFilter = audioCtx.createBiquadFilter();
      vocalFilter.type = 'peaking';
      vocalFilter.frequency.value = 2500;
      vocalFilter.Q.value = 1.0;
      vocalFilter.gain.value = 6;

      // Noise Gate
      const gate = audioCtx.createDynamicsCompressor();
      gate.threshold.setValueAtTime(-36, audioCtx.currentTime);
      gate.knee.setValueAtTime(10, audioCtx.currentTime);
      gate.ratio.setValueAtTime(20, audioCtx.currentTime);
      gate.attack.setValueAtTime(0.005, audioCtx.currentTime);
      gate.release.setValueAtTime(0.1, audioCtx.currentTime);

      // Limiter
      const limiter = audioCtx.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-1, audioCtx.currentTime);
      limiter.ratio.setValueAtTime(20, audioCtx.currentTime);

      source.connect(hpFilter);
      hpFilter.connect(vocalFilter);
      vocalFilter.connect(gate);
      gate.connect(limiter);
      limiter.connect(destination);

      const processedAudioTrack = destination.stream.getAudioTracks()[0];
      const videoTrack = this.stream.getVideoTracks()[0];
      
      this.processedStream = new MediaStream([videoTrack, processedAudioTrack]);
      this.audioCtx = audioCtx;
    } catch (err) {
      console.warn('[FaceMonitor] Audio processing failed, using raw stream:', err);
      this.processedStream = this.stream;
    }
  },

  // ─── Return the combined stream for the recorder ──────────
  getProcessedStream() {
    return this.processedStream || this.stream;
  },

  // ─── Black Frame Detection (camera shutter/cover) ──────
  _startBlackFrameDetection() {
    const checkCanvas = document.createElement('canvas');
    checkCanvas.width = 32;
    checkCanvas.height = 24;
    const checkCtx = checkCanvas.getContext('2d', { willReadFrequently: true });

    this._blackFrameInterval = setInterval(() => {
      if (!this.detecting || !this.videoEl || this.videoEl.paused || this.videoEl.ended) return;

      try {
        checkCtx.drawImage(this.videoEl, 0, 0, 32, 24);
        const imageData = checkCtx.getImageData(0, 0, 32, 24);
        const pixels = imageData.data;
        let totalBrightness = 0;
        const pixelCount = pixels.length / 4;

        for (let i = 0; i < pixels.length; i += 4) {
          totalBrightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
        }

        const avgBrightness = totalBrightness / pixelCount;

        if (avgBrightness < 10) {
          this._blackFrameCount++;
          if (this._blackFrameCount >= this.BLACK_FRAME_THRESHOLD && !this.cameraBlocked) {
            this.cameraBlocked = true;
            this._handleCameraShuttered();
          }
        } else {
          if (this.cameraBlocked) {
            this.cameraBlocked = false;
          }
          this._blackFrameCount = 0;
        }
      } catch (e) {
        // Canvas security errors, ignore
      }
    }, 500);
  },

  _handleCameraShuttered() {
    if (this.onImmediateWarning) {
      this.onImmediateWarning('⚠️ Camera appears to be covered or blocked!');
    }
    if (this.onFaceStatusChange) {
      this.onFaceStatusChange(false);
    }
    this.facePresent = false;

    if (!this.graceTimerActive && this.detecting) {
      this._startGrace('Camera is covered or blocked — please uncover your camera');
    }
  },

  // ─── Start Detection Loop ──────────────────────────────
  startDetection() {
    this.detecting = true;
    this.consecutiveMisses = 0;
    this._detectionFrameCount = 0;
    this._initialGraceDone = false;

    if (!this.modelsLoaded) {
      console.warn('[NEXA] Face detection models not loaded — running camera-only monitoring');
      // Still mark face as present so we don't penalize the student
      this.facePresent = true;
      if (this.onFaceStatusChange) this.onFaceStatusChange(true);
      return;
    }

    this._detectLoop();
  },

  async _detectLoop() {
    if (!this.detecting) return;
    if (!this.videoEl || this.videoEl.paused || this.videoEl.ended) {
      requestAnimationFrame(() => this._detectLoop());
      return;
    }

    try {
      // Use TinyFaceDetector — fast and lightweight
      const options = new faceapi.TinyFaceDetectorOptions({ 
        inputSize: 224, 
        scoreThreshold: 0.35 
      });
      const detections = await faceapi.detectAllFaces(this.videoEl, options);

      this._detectionFrameCount++;
      const wasFacePresent = this.facePresent;

      if (detections.length === 1) {
        // ── Single face found ──
        this.facePresent = true;
        this.consecutiveMisses = 0;
        this._initialGraceDone = true;

        if (!wasFacePresent && this.graceTimerActive) {
          this._cancelGrace();
        }
      } else if (detections.length === 0) {
        // ── No face ──
        this.consecutiveMisses++;

        // Skip initial frames to give user time to position
        if (!this._initialGraceDone && this._detectionFrameCount <= this.INITIAL_GRACE_FRAMES) {
          // Still in initial grace — don't penalize yet
        } else {
          this.facePresent = false;
          this._initialGraceDone = true;

          // Immediate visual warning after consecutive misses
          if (this.consecutiveMisses >= this.INSTANT_WARNING_THRESHOLD && wasFacePresent) {
            if (this.onImmediateWarning) {
              this.onImmediateWarning('Face not detected — look at the camera!');
            }
          }

          // Start grace timer if face was previously present
          if (wasFacePresent && !this.graceTimerActive) {
            this._startGrace('Face not detected — please look at the camera');
          }
          
          // If grace not active and face was never present after initial period, start it
          if (!wasFacePresent && !this.graceTimerActive && this._detectionFrameCount > this.INITIAL_GRACE_FRAMES) {
            this._startGrace('Face not detected — please look at the camera');
          }
        }
      } else if (detections.length > 1) {
        // ── Multiple faces ──
        this.facePresent = false;
        this._initialGraceDone = true;
        this.consecutiveMisses++;

        if (this.onImmediateWarning) {
          this.onImmediateWarning('Multiple faces detected — only you should be visible!');
        }

        if (!this.graceTimerActive) {
          this._startGrace('Multiple faces detected — only exam-taker should be visible');
        }
      }

      if (wasFacePresent !== this.facePresent && this.onFaceStatusChange) {
        this.onFaceStatusChange(this.facePresent);
      }

      // ─── Draw clean green square overlay ──────────────────
      if (this.canvasEl) {
        // Sync canvas dimensions to video
        const vw = this.videoEl.videoWidth || 320;
        const vh = this.videoEl.videoHeight || 240;
        if (this.canvasEl.width !== vw || this.canvasEl.height !== vh) {
          this.canvasEl.width = vw;
          this.canvasEl.height = vh;
        }

        const ctx = this.canvasEl.getContext('2d');
        ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);

        const dims = { width: this.canvasEl.width, height: this.canvasEl.height };
        const resized = faceapi.resizeResults(detections, dims);

        resized.forEach(det => {
          const { box } = det;
          
          // Pad the box slightly for a cleaner look
          const pad = 8;
          const bx = Math.max(0, box.x - pad);
          const by = Math.max(0, box.y - pad);
          const bw = Math.min(dims.width - bx, box.width + pad * 2);
          const bh = Math.min(dims.height - by, box.height + pad * 2);

          // Draw solid green square border
          ctx.strokeStyle = '#00d4aa';
          ctx.lineWidth = 3;
          ctx.lineJoin = 'round';
          ctx.strokeRect(bx, by, bw, bh);

          // Draw corner accents for a clean modern look
          const cornerLen = 18;
          ctx.strokeStyle = '#00d4aa';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';

          // Top-left
          ctx.beginPath();
          ctx.moveTo(bx, by + cornerLen);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx + cornerLen, by);
          ctx.stroke();

          // Top-right
          ctx.beginPath();
          ctx.moveTo(bx + bw - cornerLen, by);
          ctx.lineTo(bx + bw, by);
          ctx.lineTo(bx + bw, by + cornerLen);
          ctx.stroke();

          // Bottom-left
          ctx.beginPath();
          ctx.moveTo(bx, by + bh - cornerLen);
          ctx.lineTo(bx, by + bh);
          ctx.lineTo(bx + cornerLen, by + bh);
          ctx.stroke();

          // Bottom-right
          ctx.beginPath();
          ctx.moveTo(bx + bw - cornerLen, by + bh);
          ctx.lineTo(bx + bw, by + bh);
          ctx.lineTo(bx + bw, by + bh - cornerLen);
          ctx.stroke();
        });
      }

    } catch (err) {
      console.warn('[FaceMonitor] Detection error:', err);
    }

    // Run detection every ~500ms for smooth performance
    setTimeout(() => this._detectLoop(), 500);
  },

  // ─── Grace Timer ────────────────────────────────────────
  _startGrace(reason) {
    if (this.graceTimerActive) return;
    this.graceTimerActive = true;
    this.graceCountdown = this.GRACE_SECONDS;
    this.graceReason = reason;

    console.log(`[NEXA Grace] Started: ${reason} (${this.GRACE_SECONDS}s)`);

    if (this.onGraceStart) this.onGraceStart(this.GRACE_SECONDS, reason);

    this.graceInterval = setInterval(() => {
      this.graceCountdown--;
      if (this.onGraceTick) this.onGraceTick(this.graceCountdown);

      if (this.graceCountdown <= 0) {
        this._graceExpired();
      }
    }, 1000);
  },

  _cancelGrace() {
    if (!this.graceTimerActive) return;
    console.log('[NEXA Grace] Cancelled — face returned');
    this.graceTimerActive = false;
    clearInterval(this.graceInterval);
    if (this.onGraceEnd) this.onGraceEnd();
  },

  _graceExpired() {
    clearInterval(this.graceInterval);
    this.graceTimerActive = false;
    console.log('[NEXA Grace] Expired — issuing warning');

    // Trigger warning
    if (this.onWarning) {
      this.onWarning('face_absent', this.graceReason || 'Face not detected');
    }

    if (this.onGraceEnd) this.onGraceEnd();

    // If face is still absent, start grace again after a short delay
    if (!this.facePresent && this.detecting) {
      setTimeout(() => {
        if (!this.facePresent && this.detecting) {
          this._startGrace(this.graceReason);
        }
      }, 2000);
    }
  },

  // ─── Camera Off Handler ─────────────────────────────────
  _handleCameraOff(reason) {
    this.facePresent = false;

    if (this.onImmediateWarning) {
      this.onImmediateWarning(reason || 'Camera was turned off or blocked');
    }

    if (this.onFaceStatusChange) this.onFaceStatusChange(false);
    if (!this.graceTimerActive && this.detecting) {
      this._startGrace(reason || 'Camera was turned off or blocked');
    }
  },

  // ─── Stop Everything ────────────────────────────────────
  stop() {
    this.detecting = false;
    this._cancelGrace();
    this.consecutiveMisses = 0;
    this._blackFrameCount = 0;
    this._detectionFrameCount = 0;
    this._initialGraceDone = false;
    this.cameraBlocked = false;

    if (this._cameraCheckInterval) {
      clearInterval(this._cameraCheckInterval);
    }
    if (this._blackFrameInterval) {
      clearInterval(this._blackFrameInterval);
    }

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }

    this.processedStream = null;

    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }
  },

  // ─── Get snapshot for admin proctoring ──────────────────
  getSnapshot() {
    if (!this.videoEl) return null;
    const canvas = document.createElement('canvas');
    canvas.width = this.videoEl.videoWidth || 320;
    canvas.height = this.videoEl.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    // Only take snapshot if the video has started providing real pixels
    if (this.videoEl.videoWidth === 0 || this.videoEl.currentTime < 0.5) {
      return null;
    }
    
    // Draw raw video frame
    ctx.drawImage(this.videoEl, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.5);
  },
};
