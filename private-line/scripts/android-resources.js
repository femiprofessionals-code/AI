// Android resources: launcher icons, notification icon, splash screens, ringtone and message sound.
//   node scripts/android-resources.js   (after `npx cap add android`)
const fs = require('fs');
const path = require('path');
const { render, bubble, TEAL } = require('./icon-art');

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const write = (rel, buf) => {
  const p = path.join(RES, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
};

// Adaptive-icon foreground: the bubble only, scaled into the 66/108 safe zone.
const k = 108 / 72;
const foreground = (x, y) => bubble(0.5 + (x - 0.5) * k, 0.5 + (y - 0.5) * k, { bg: false });
// Status-bar icon: white bubble with the two dots cut out.
const silhouette = (x, y) => bubble(x, y, { bg: false, mono: true });

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, f] of Object.entries(densities)) {
  const s = Math.round(48 * f);
  write(`mipmap-${name}/ic_launcher.png`, render(s, s, (x, y) => bubble(x, y)));
  write(`mipmap-${name}/ic_launcher_round.png`, render(s, s, (x, y) => (Math.hypot(x - 0.5, y - 0.5) <= 0.5 ? bubble(0.5 + (x - 0.5) * 0.9, 0.5 + (y - 0.5) * 0.9) || TEAL : null)));
  const fg = Math.round(108 * f);
  write(`mipmap-${name}/ic_launcher_foreground.png`, render(fg, fg, foreground));
  const n = Math.round(24 * f);
  write(`drawable-${name}/ic_stat_notify.png`, render(n, n, silhouette));
}
write('values/ic_launcher_background.xml', '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0F766E</color>\n</resources>\n');

// Splash screens: teal with the bubble in the middle, at each existing size.
for (const dir of fs.readdirSync(RES)) {
  const f = path.join(RES, dir, 'splash.png');
  if (!fs.existsSync(f)) continue;
  const b = fs.readFileSync(f);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const size = Math.min(w, h) * 0.3;
  fs.writeFileSync(f, render(w, h, (x, y) => {
    const u = (x * w - (w - size) / 2) / size, v = (y * h - (h - size) / 2) / size;
    return (u >= 0 && u <= 1 && v >= 0 && v <= 1 && bubble(u, v, { bg: false })) || TEAL;
  }));
}

// Sounds (16-bit mono WAV).
function wav(seconds, sampleFn, rate = 22050) {
  const n = Math.round(seconds * rate);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sampleFn(i / rate))) * 26000), i * 2);
  const hd = Buffer.alloc(44);
  hd.write('RIFF', 0); hd.writeUInt32LE(36 + data.length, 4); hd.write('WAVE', 8);
  hd.write('fmt ', 12); hd.writeUInt32LE(16, 16); hd.writeUInt16LE(1, 20); hd.writeUInt16LE(1, 22);
  hd.writeUInt32LE(rate, 24); hd.writeUInt32LE(rate * 2, 28); hd.writeUInt16LE(2, 32); hd.writeUInt16LE(16, 34);
  hd.write('data', 36); hd.writeUInt32LE(data.length, 40);
  return Buffer.concat([hd, data]);
}
const tone = (t, f) => Math.sin(2 * Math.PI * f * t);
// Ringtone: 30 s of "ring-ring … pause" so the phone keeps ringing while the call waits.
write('raw/ringtone.wav', wav(30, (t) => {
  const c = t % 3;
  const on = c < 0.4 || (c > 0.6 && c < 1.0);
  if (!on) return 0;
  const local = c < 0.4 ? c : c - 0.6;
  const env = Math.min(1, local * 60, (0.4 - local) * 60);
  return env * 0.5 * (tone(t, 880) + tone(t, 1100)) * (0.75 + 0.25 * tone(t, 20));
}));
// Message: short two-note chime.
write('raw/message.wav', wav(0.5, (t) => {
  const f = t < 0.18 ? 988 : 1319;
  const local = t < 0.18 ? t : t - 0.18;
  return Math.exp(-local * 9) * tone(t, f) * Math.min(1, t * 200);
}));
console.log('Android resources written.');
