const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const dir = process.argv[2];
const T = { '.html': 'text/html', '.js': 'application/javascript', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4' };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const route = (r) => { let p = decodeURIComponent(new URL(r.request().url()).pathname); if (p === '/') p = '/index.html'; const f = path.join(dir, p); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' }); r.fulfill({ status: 200, body: fs.readFileSync(f), contentType: T[path.extname(f)] || 'application/octet-stream' }); };
  await ctx.route('https://app.local/**', route);
  let page = await ctx.newPage(); await page.goto('https://app.local/'); await page.waitForTimeout(2500);
  await page.evaluate(() => { const s = globalThis.__app.getState(); s.addStars(7, 'test'); s.saveLesson({ ...s.lessonState('L2'), status: 'completed', stars: 3, taught: true }); s.setName('Janelle'); s.setSetting('dailyMinutes', 15); });
  await page.close();
  page = await ctx.newPage(); await page.goto('https://app.local/'); await page.waitForTimeout(2500);
  const st = await page.evaluate(() => { const s = globalThis.__app.getState(); return { stars: s.stars, l2: s.progress.L2?.status, l2stars: s.progress.L2?.stars, name: s.name, mins: s.settings.dailyMinutes, photo: s.photos.length }; });
  console.log(JSON.stringify(st));
  console.log(st.stars === 7 && st.l2 === 'completed' && st.l2stars === 3 && st.mins === 15 && st.photo === 1 ? 'PASS  progress, settings and photo survive closing the app' : 'FAIL');
  await b.close();
})();
