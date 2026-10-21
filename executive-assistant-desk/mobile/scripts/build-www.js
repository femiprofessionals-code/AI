// Builds mobile/www from the desktop app's shared screens plus the Android engine.
//   node scripts/build-www.js
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..', '..');
const WWW = path.join(__dirname, '..', 'www');
fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

const copy = (from, to) => fs.copyFileSync(path.join(ROOT, from), path.join(WWW, to));
for (const f of ['app.js', 'speech.js', 'alarm.js', 'vibrate.js', 'styles.css']) copy(`src/renderer/${f}`, f);
copy('src/shared/tz.js', 'tz.js');
copy('src/shared/tasks.js', 'tasks.js');
copy('assets/icon.png', 'icon.png');

let html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
html = html
  .replace('../shared/tz.js', 'tz.js')
  .replace('../shared/tasks.js', 'tasks.js')
  .replace('../../assets/icon.png', 'icon.png')
  // The phone talks to Firebase directly (the desktop does it from its main process).
  .replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/,
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\' data:; ' +
      'connect-src \'self\' https://*.googleapis.com http://127.0.0.1:* http://10.0.2.2:*">\n  ' +
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  )
  .replace('<body>', '<body class="mobile">')
  .replace('<script src="app.js"></script>', '<script src="mobile.js"></script>\n  <script src="app.js"></script>');
if (!html.includes('mobile.js')) throw new Error('could not inject mobile.js');
fs.writeFileSync(path.join(WWW, 'index.html'), html);

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'src', 'mobile.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome100'],
  outfile: path.join(WWW, 'mobile.js'),
  logLevel: 'warning',
});
console.log('www built:', fs.readdirSync(WWW).join(', '));
