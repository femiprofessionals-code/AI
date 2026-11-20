// Screenshots chosen routes of the web build at 1280x800: node tools/ui-shots.js <web> <out> '<json routes>'
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const [dir, out, routesJson] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.m4a': 'audio/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on('pageerror', (e) => { if (!/play\(\)/.test(e.message)) errs.push(e.message); });
  await page.route('https://app.local/**', (r) => { let p = decodeURIComponent(new URL(r.request().url()).pathname); if (p === '/') p = '/index.html'; const f = path.join(dir, p); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' }); });
  await page.goto('https://app.local/'); await page.waitForTimeout(2500);
  for (const [name, route] of JSON.parse(routesJson)) {
    if (route) await page.evaluate((r) => { const s = globalThis.__app.getState(); s.home(); s.go(r); }, route);
    await page.waitForTimeout(1800); await page.screenshot({ path: `${out}/${name}.png` });
  }
  console.log('errors:', errs.length, errs.slice(0, 3).join(' | ')); await b.close();
})();
