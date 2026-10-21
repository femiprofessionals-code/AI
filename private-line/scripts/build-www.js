// Builds www/ (what the Android app shows) from src/.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });
for (const f of ['index.html', 'styles.css']) fs.copyFileSync(path.join(ROOT, 'src', f), path.join(WWW, f));
fs.copyFileSync(path.join(ROOT, 'assets', 'icon.png'), path.join(WWW, 'icon.png'));
// Firebase web-app settings: FIREBASE_WEB_CONFIG (JSON, e.g. a CI secret) or src/firebase-config.json.
let firebaseConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'firebase-config.json'), 'utf8'));
if (process.env.FIREBASE_WEB_CONFIG) {
  let text = process.env.FIREBASE_WEB_CONFIG.trim();
  // Accept the snippet as copied from the Firebase console ("const firebaseConfig = { apiKey: ... };").
  text = text.replace(/^[^{]*/, '').replace(/[^}]*$/, '').replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":').replace(/'/g, '"').replace(/,\s*}/g, '}');
  firebaseConfig = JSON.parse(text);
}
// Push notifications need android/app/google-services.json (from the Firebase console).
const pushEnabled = fs.existsSync(path.join(ROOT, 'android', 'app', 'google-services.json'));
console.log(`Firebase project: ${firebaseConfig.projectId || '(not set)'}; push notifications: ${pushEnabled ? 'on' : 'off'}`);

esbuild.buildSync({
  define: {
    __FIREBASE_CONFIG__: JSON.stringify(firebaseConfig),
    __PUSH_ENABLED__: JSON.stringify(pushEnabled),
  },
  entryPoints: [path.join(ROOT, 'src', 'js', 'app.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100'],
  minify: true,
  sourcemap: false,
  outfile: path.join(WWW, 'app.js'),
  logLevel: 'warning',
});
console.log('www built:', fs.readdirSync(WWW).map((f) => `${f} (${Math.round(fs.statSync(path.join(WWW, f)).size / 1024)} KB)`).join(', '));
