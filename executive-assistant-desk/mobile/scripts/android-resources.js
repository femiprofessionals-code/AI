// Generates Android resources: launcher icons, the notification icon and the alarm sound.
//   node scripts/android-resources.js   (run after `npx cap add android`)
const fs = require('fs');
const path = require('path');
const { render, sample } = require('../../scripts/make-icons');

const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const write = (rel, buf) => {
  const p = path.join(RES, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
};

// Adaptive-icon foreground: the clock, kept inside the 66/108 safe zone.
function foreground(x, y) {
  const k = 108 / 72;
  const c = sample(0.5 + (x - 0.5) * k, 0.5 + (y - 0.5) * k);
  if (!c) return null;
  const d = Math.hypot(0.5 + (x - 0.5) * k - 0.5, 0.5 + (y - 0.5) * k - 0.5);
  return d < 0.4 ? c : null; // drop the navy square; the background layer supplies it
}

// Status-bar notification icon: white silhouette on transparent.
function silhouette(x, y) {
  const cx = x - 0.5, cy = y - 0.5, d = Math.hypot(cx, cy);
  if (d > 0.46) return null;
  if (d > 0.38) return [255, 255, 255];
  const seg = (ax, ay, bx, by, w) => {
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - (ax + t * vx), y - (ay + t * vy)) < w;
  };
  if (seg(0.5, 0.5, 0.5, 0.2, 0.05) || seg(0.5, 0.5, 0.3, 0.4, 0.055)) return [255, 255, 255];
  return null;
}

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, f] of Object.entries(densities)) {
  write(`mipmap-${name}/ic_launcher.png`, render(Math.round(48 * f)));
  write(`mipmap-${name}/ic_launcher_round.png`, render(Math.round(48 * f)));
  write(`mipmap-${name}/ic_launcher_foreground.png`, render(Math.round(108 * f), foreground));
  write(`drawable-${name}/ic_stat_notify.png`, render(Math.round(24 * f), silhouette));
}
write('values/ic_launcher_background.xml', '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1F3A68</color>\n</resources>\n');

// Alarm sound for the "Attention alerts" notification channel: 4 s rising/falling siren.
function wav(seconds, rate = 22050) {
  const n = Math.round(seconds * rate);
  const data = Buffer.alloc(n * 2);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const sweep = (t % 0.5) / 0.5;
    const f = 700 + 900 * (sweep < 0.5 ? sweep * 2 : 2 - sweep * 2);
    phase += (2 * Math.PI * f) / rate;
    const saw = ((phase / Math.PI) % 2) - 1;
    const env = Math.min(1, t * 40, (seconds - t) * 40);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, saw * 0.9)) * env * 30000), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
write('raw/alarm.wav', wav(4));

// Splash screens: navy background with the clock in the middle, at each existing size.
function splash(w, h) {
  const buf = Buffer.alloc(w * h * 4);
  const size = Math.min(w, h) * 0.32;
  const ox = (w - size) / 2, oy = (h - size) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let c = [31, 58, 104];
      const u = (x - ox) / size, v = (y - oy) / size;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) c = sample(u, v) || c;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
    }
  }
  return pngRect(w, h, buf);
}
function pngRect(w, h, rgba) {
  // PNG encoder for non-square images (make-icons' png() only writes squares).
  const zlib = require('zlib');
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const dir of fs.readdirSync(RES)) {
  const f = path.join(RES, dir, 'splash.png');
  if (!fs.existsSync(f)) continue;
  const b = fs.readFileSync(f);
  fs.writeFileSync(f, splash(b.readUInt32BE(16), b.readUInt32BE(20)));
}
console.log('Android resources written to', RES);
