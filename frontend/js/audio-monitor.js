// ============================================================
// NEXA Audio Monitor Module
// ============================================================

const AudioMonitor = {
  audioContext: null,
  analyser: null,
  microphone: null,
  scriptProcessor: null,
  isActive: false,
  
  // Settings
  threshold: 0.15, // RMS threshold (0.0 to 1.0)
  cooldown: 3000,   // Grace period between alerts (ms)
  lastAlertTime: 0,
  
  callbacks: {
    onNoiseDetected: null,
    onLevelChange: null
  },

  async init(stream, options = {}) {
    if (this.isActive) return true;
    
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      
      this.analyser.fftSize = 1024; // Better resolution
      this.analyser.smoothingTimeConstant = 0.5;
      this.microphone.connect(this.analyser);
      
      this.threshold = options.threshold || 0.12;
      this.callbacks.onNoiseDetected = options.onNoiseDetected || null;
      this.callbacks.onLevelChange = options.onLevelChange || null;

      this.isActive = true;
      this.monitor();
      return true;
    } catch (err) {
      console.error('[NEXA Audio] Initialization failed:', err);
      return false;
    }
  },

  monitor() {
    if (!this.isActive) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    
    const checkVolume = () => {
      if (!this.isActive) return;
      
      this.analyser.getFloatTimeDomainData(dataArray);
      
      // Calculate Peak and RMS level
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = Math.abs(dataArray[i]);
        sum += val * val;
        if (val > peak) peak = val;
      }
      
      const rms = Math.sqrt(sum / bufferLength);
      // Use a weighted score (mostly peak, some RMS) for better responsiveness to voices
      const volumeLevel = (peak * 0.7) + (rms * 0.3);

      if (this.callbacks.onLevelChange) {
        this.callbacks.onLevelChange(volumeLevel);
      }

      // Check against threshold
      if (volumeLevel > this.threshold) {
        const now = Date.now();
        if (now - this.lastAlertTime > this.cooldown) {
          this.lastAlertTime = now;
          if (this.callbacks.onNoiseDetected) {
            this.callbacks.onNoiseDetected(volumeLevel);
          }
        }
      }

      requestAnimationFrame(checkVolume);
    };

    checkVolume();
  },

  stop() {
    this.isActive = false;
    if (this.microphone) this.microphone.disconnect();
    if (this.audioContext) this.audioContext.close();
  }
};
