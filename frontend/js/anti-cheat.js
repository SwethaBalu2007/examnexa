// ============================================================
// NEXA Anti-Cheat System
// ============================================================

const AntiCheat = {
  active: false,
  callbacks: {
    onWarning: null, // (type, description) => void
  },

  start(onWarning) {
    this.active = true;
    this.callbacks.onWarning = onWarning;
    this._bindKeydown = this._handleKeydown.bind(this);
    this._bindContextMenu = this._handleContextMenu.bind(this);
    this._bindCopyPaste = this._handleCopyPaste.bind(this);
    this._bindVisibility = this._handleVisibility.bind(this);
    this._bindBeforeUnload = this._handleBeforeUnload.bind(this);

    document.addEventListener('keydown', this._bindKeydown, true);
    document.addEventListener('contextmenu', this._bindContextMenu, true);
    document.addEventListener('copy', this._bindCopyPaste, true);
    document.addEventListener('paste', this._bindCopyPaste, true);
    document.addEventListener('cut', this._bindCopyPaste, true);
    document.addEventListener('visibilitychange', this._bindVisibility);
    window.addEventListener('beforeunload', this._bindBeforeUnload);
    window.addEventListener('blur', this._handleBlur.bind(this));
  },

  stop() {
    this.active = false;
    document.removeEventListener('keydown', this._bindKeydown, true);
    document.removeEventListener('contextmenu', this._bindContextMenu, true);
    document.removeEventListener('copy', this._bindCopyPaste, true);
    document.removeEventListener('paste', this._bindCopyPaste, true);
    document.removeEventListener('cut', this._bindCopyPaste, true);
    document.removeEventListener('visibilitychange', this._bindVisibility);
    window.removeEventListener('beforeunload', this._bindBeforeUnload);
  },

  _handleKeydown(e) {
    if (!this.active) return;

    // Block Shift key usage
    if (e.key === 'Shift') {
      e.preventDefault();
      this._triggerWarning('keyboard', 'Shift key used');
      return;
    }

    // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    if (e.key === 'F12') {
      e.preventDefault();
      this._triggerWarning('keyboard', 'F12 (Developer Tools) key pressed');
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      const blockedCombos = {
        'c': 'Copy (Ctrl+C)',
        'v': 'Paste (Ctrl+V)',
        'a': 'Select All (Ctrl+A)',
        'u': 'View Source (Ctrl+U)',
        'p': 'Print (Ctrl+P)',
        's': 'Save (Ctrl+S)',
        'Tab': 'Tab Switch (Ctrl+Tab)',
      };

      const key = e.key.toLowerCase();
      if (blockedCombos[key]) {
        e.preventDefault();
        this._triggerWarning('keyboard', `${blockedCombos[key]} detected`);
        return;
      }

      if (e.shiftKey) {
        const shiftCombos = {
          'i': 'DevTools (Ctrl+Shift+I)',
          'j': 'Console (Ctrl+Shift+J)',
          'c': 'Inspect (Ctrl+Shift+C)',
        };
        if (shiftCombos[key]) {
          e.preventDefault();
          this._triggerWarning('keyboard', `${shiftCombos[key]} detected`);
          return;
        }
      }
    }

    // Alt+Tab warning
    if (e.altKey && e.key === 'Tab') {
      e.preventDefault();
      this._triggerWarning('keyboard', 'Alt+Tab detected');
    }
  },

  _handleContextMenu(e) {
    if (!this.active) return;
    e.preventDefault();
    this._triggerWarning('right_click', 'Right-click detected');
  },

  _handleCopyPaste(e) {
    if (!this.active) return;
    e.preventDefault();
    const action = e.type.charAt(0).toUpperCase() + e.type.slice(1);
    this._triggerWarning('copy_paste', `${action} operation detected`);
  },

  _handleVisibility() {
    if (!this.active) return;
    if (document.hidden) {
      this._triggerWarning('tab_switch', 'Student switched to another tab');
    }
  },

  _handleBlur() {
    if (!this.active) return;
    // Small delay to avoid false positives from modal interactions
    setTimeout(() => {
      if (!this.active) return;
      if (!document.hasFocus()) {
        this._triggerWarning('tab_switch', 'Window lost focus — possible tab switch');
      }
    }, 200);
  },

  _handleBeforeUnload(e) {
    if (!this.active) return;
    e.preventDefault();
    e.returnValue = 'You are in an active exam. Leaving will auto-submit your exam.';
    return e.returnValue;
  },

  _triggerWarning(type, description) {
    if (this.callbacks.onWarning) {
      this.callbacks.onWarning(type, description);
    }
    showToast(`⚠️ ${description}`, 'warning');
  },
};
