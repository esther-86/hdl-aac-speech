/**
 * ClearVoice AAC - Speech Synthesis (Text-to-Speech)
 * Supports all browser/OS voices (Windows, macOS, iOS, Android, Chrome/Edge Natural Voices)
 * and persists the chosen voice URI reliably across async voice loading.
 */

class SpeechSynthesisService {
  constructor() {
    this.synth =
      typeof window !== 'undefined' && 'speechSynthesis' in window
        ? window.speechSynthesis
        : null;
    this.voices = [];
    this.selectedVoice = null;
    this.desiredVoiceURI = '';
    this.rate = 0.95;
    this.pitch = 1.05;
    this.volume = 1.0;
    this.isSpeaking = false;
    this.listeners = new Set();

    if (this.synth) {
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => {
          this.loadVoices();
          this.listeners.forEach((cb) => {
            try {
              cb(this.voices);
            } catch (e) {
              // ignore
            }
          });
        };
      }
    }
  }

  onVoicesChanged(callback) {
    if (typeof callback !== 'function') return () => {};
    this.listeners.add(callback);
    if (this.voices.length > 0) {
      callback(this.voices);
    } else {
      this.loadVoices();
      if (this.voices.length > 0) callback(this.voices);
    }
    return () => this.listeners.delete(callback);
  }

  loadVoices() {
    if (!this.synth) return;
    try {
      const available = this.synth.getVoices() || [];
      if (available.length > 0) {
        // Put English voices first for easy selection
        this.voices = [...available].sort((a, b) => {
          const aEn = (a.lang || '').toLowerCase().startsWith('en') ? 0 : 1;
          const bEn = (b.lang || '').toLowerCase().startsWith('en') ? 0 : 1;
          if (aEn !== bEn) return aEn - bEn;
          return (a.name || '').localeCompare(b.name || '');
        });
      }
    } catch (e) {
      this.voices = [];
    }

    if (this.voices.length === 0) return;

    // 1. Honor user's explicitly selected voice URI if set
    if (this.desiredVoiceURI) {
      const exact = this.voices.find(
        (v) => v.voiceURI === this.desiredVoiceURI || v.name === this.desiredVoiceURI
      );
      if (exact) {
        this.selectedVoice = exact;
        return;
      }
    }

    // 2. Otherwise default to a warm female/child-friendly English voice (e.g. Zira, Aria, Jenny, Ana, Samantha, Google US English)
    if (!this.selectedVoice) {
      const preferred =
        this.voices.find(
          (v) =>
            v.lang &&
            v.lang.toLowerCase().startsWith('en') &&
            (v.name.includes('Ana') ||
              v.name.includes('Jenny') ||
              v.name.includes('Aria') ||
              v.name.includes('Zira') ||
              v.name.includes('Samantha') ||
              v.name.includes('Google US English') ||
              v.name.includes('Natural') ||
              v.name.includes('Karen') ||
              v.name.includes('Victoria'))
        ) ||
        this.voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en')) ||
        this.voices[0];

      this.selectedVoice = preferred;
      if (preferred && !this.desiredVoiceURI) {
        this.desiredVoiceURI = preferred.voiceURI;
      }
    }
  }

  getVoices() {
    if (this.voices.length === 0 && this.synth) {
      this.loadVoices();
    }
    return this.voices;
  }

  getSelectedVoiceURI() {
    if (this.desiredVoiceURI) return this.desiredVoiceURI;
    if (this.selectedVoice) return this.selectedVoice.voiceURI;
    return '';
  }

  setVoice(voiceURI) {
    if (!voiceURI) return;
    this.desiredVoiceURI = voiceURI;
    if (this.voices.length === 0 && this.synth) {
      this.loadVoices();
    }
    const v = this.voices.find(
      (item) => item.voiceURI === voiceURI || item.name === voiceURI
    );
    if (v) {
      this.selectedVoice = v;
    }
  }

  setSettings({
    speechRate,
    speechPitch,
    speechVolume,
    selectedVoiceURI,
    rate,
    pitch,
    volume,
    voiceURI
  } = {}) {
    const nextRate = speechRate !== undefined ? speechRate : rate;
    const nextPitch = speechPitch !== undefined ? speechPitch : pitch;
    const nextVol = speechVolume !== undefined ? speechVolume : volume;
    const nextVoice = selectedVoiceURI !== undefined ? selectedVoiceURI : voiceURI;

    if (nextRate !== undefined) this.rate = nextRate;
    if (nextPitch !== undefined) this.pitch = nextPitch;
    if (nextVol !== undefined) this.volume = nextVol;
    if (nextVoice) this.setVoice(nextVoice);
  }

  speak(text, onStart = null, onEnd = null) {
    if (!text) return;

    if (!this.synth || typeof SpeechSynthesisUtterance === 'undefined') {
      this.isSpeaking = true;
      if (onStart) onStart();
      setTimeout(() => {
        this.isSpeaking = false;
        if (onEnd) onEnd();
      }, 900);
      return;
    }

    try {
      this.loadVoices();
      this.synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      if (this.desiredVoiceURI && this.voices.length > 0) {
        const matched = this.voices.find(
          (v) => v.voiceURI === this.desiredVoiceURI || v.name === this.desiredVoiceURI
        );
        if (matched) {
          this.selectedVoice = matched;
        }
      }
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.rate = this.rate;
      utterance.pitch = this.pitch;
      utterance.volume = this.volume;

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        this.isSpeaking = false;
        if (onEnd) onEnd();
      };

      utterance.onstart = () => {
        this.isSpeaking = true;
        if (onStart) onStart();
      };

      utterance.onend = () => finish();
      utterance.onerror = () => finish();

      this.isSpeaking = true;
      if (onStart) onStart();
      this.synth.speak(utterance);

      const approxDurationMs = Math.max(1200, Math.min(8000, text.length * 90));
      setTimeout(finish, approxDurationMs);
    } catch (e) {
      this.isSpeaking = false;
      if (onEnd) onEnd();
    }
  }

  stop() {
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (e) {
        // ignore
      }
      this.isSpeaking = false;
    }
  }
}

export const speechService = new SpeechSynthesisService();
