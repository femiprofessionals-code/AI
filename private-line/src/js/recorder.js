// Voice notes with the phone's microphone (MediaRecorder; Opus in WebM on Android).
export class VoiceRecorder {
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.startedAt = Date.now();
    this.rec.start(250);
  }

  elapsed() { return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0; }

  /** Stop and return { blob, mime, duration } (or null when cancelled). */
  stop(cancel) {
    return new Promise((resolve) => {
      if (!this.rec) return resolve(null);
      const duration = this.elapsed();
      this.rec.onstop = () => {
        this.stream.getTracks().forEach((t) => t.stop());
        const mime = (this.rec.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(this.chunks, { type: mime });
        this.rec = null;
        this.startedAt = 0;
        resolve(cancel ? null : { blob, mime, duration: Math.round(duration * 10) / 10 });
      };
      this.rec.stop();
    });
  }
}
