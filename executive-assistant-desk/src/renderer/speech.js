/*
 * Spoken announcement queue. Announcements play one at a time in arrival order
 * (overlapping meetings never talk over each other), and each reminder key is
 * spoken at most once per session even if it is delivered twice.
 * Attention-mode entries (`alarm: true`) play the loud alarm first, then the voice.
 */
(function () {
  const PAUSE_BETWEEN_MS = 700;

  class SpeechQueue {
    constructor(getSettings) {
      this.getSettings = getSettings;
      this.queue = [];
      this.seen = new Set();
      this.busy = false;
      this.log = []; // what was queued, for the in-app history and automated tests
      this.voices = [];
      this.onVoices = null;
      if ('speechSynthesis' in window) {
        const load = () => {
          this.voices = window.speechSynthesis.getVoices();
          if (this.onVoices) this.onVoices(this.voices);
        };
        load();
        window.speechSynthesis.onvoiceschanged = load;
      }
    }

    enqueue(item) {
      if (item.key && this.seen.has(item.key)) return false;
      if (item.key) this.seen.add(item.key);
      const entry = { ...item, queuedAt: Date.now(), spoken: false, skipped: false };
      this.log.push(entry);
      if (this.log.length > 200) this.log.shift();
      this.queue.push(entry);
      this.run();
      return true;
    }

    async run() {
      if (this.busy) return;
      this.busy = true;
      try {
        while (this.queue.length) {
          const entry = this.queue.shift();
          const s = this.getSettings();
          if (s.muted && !entry.force) { entry.skipped = true; continue; }
          this.current = entry;
          try {
            if (entry.alarm && window.Alarm) {
              await window.Alarm.play({ sound: s.alarmSound, volume: s.alarmVolume, seconds: s.alarmSeconds });
              entry.alarmPlayed = true;
              if (entry.cancelled) continue;
              await new Promise((r) => setTimeout(r, 250));
            }
            await this.speak(entry.text, s);
            entry.spoken = true;
          } catch (e) {
            entry.error = String(e && e.message || e);
          } finally {
            this.current = null;
          }
          if (this.queue.length) await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_MS));
        }
      } finally {
        this.busy = false;
      }
    }

    /** Drop queued alarms for alerts that were acknowledged, and silence one that is playing. */
    cancelWhere(pred) {
      this.queue = this.queue.filter((e) => {
        if (!pred(e)) return true;
        e.cancelled = true;
        e.skipped = true;
        return false;
      });
      if (this.current && pred(this.current)) {
        this.current.cancelled = true;
        if (this.current.alarm && window.Alarm) window.Alarm.stop();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      }
    }

    speak(text, s) {
      if (s.speechEngine === 'windows' || window.desk.platform === 'android') {
        return window.desk.speakNative(text).then((ok) => { if (!ok) throw new Error('Windows speech failed'); });
      }
      return new Promise((resolve, reject) => {
        if (!('speechSynthesis' in window)) return reject(new Error('Speech is not available'));
        const u = new SpeechSynthesisUtterance(text);
        const v = this.voices.find((x) => x.name === s.voiceName);
        if (v) { u.voice = v; u.lang = v.lang; }
        u.volume = s.volume;
        u.rate = s.rate;
        // Safety net in case the speech engine never reports completion.
        const timer = setTimeout(() => resolve(), 4000 + text.length * 120);
        u.onend = () => { clearTimeout(timer); resolve(); };
        u.onerror = (ev) => { clearTimeout(timer); reject(new Error(ev.error || 'speech error')); };
        window.speechSynthesis.speak(u);
      });
    }
  }

  window.SpeechQueue = SpeechQueue;
})();
