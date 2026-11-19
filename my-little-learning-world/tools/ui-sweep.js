// Opens every lesson stage, every game, every exam mode and the parent area in
// the web build at tablet size, screenshots each, and reports console errors.
// Usage: node tools/ui-sweep.js <web-export-dir> <out-dir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [dir, out] = process.argv.slice(2);
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.m4a': 'audio/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /voice|Warning|Error/.test(m.text()))) logs.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => { if (!/play\(\)/.test(e.message)) logs.push(`pageerror: ${e.message}`); });
  await page.route('https://app.local/**', (route) => {
    let p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (p === '/') p = '/index.html';
    const f = path.join(dir, p);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
  });
  await page.goto('https://app.local/');
  await page.waitForTimeout(2000);
  const nav = (r) => page.evaluate((r) => { const s = globalThis.__app.getState(); s.home(); s.go(r); }, r);
  const shot = async (name, wait = 1500) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${out}/${name}.png` }); };
  await page.evaluate(() => globalThis.__app.getState().setSetting('unlockAll', true));
  const counts = await page.evaluate(() => {
    // lesson id -> number of practice activities
    return globalThis.__lessons;
  });
  const L = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];
  const sizes = { L1: 5, L2: 6, L3: 3, L4: 4, L5: 5, L6: 5, L7: 5, L8: 4, L9: 4 };
  for (const l of L) {
    for (const st of [1, 2, 3]) { await nav({ name: 'lesson', lesson: l, stage: st }); await shot(`${l}-stage${st}`, 1200); }
    for (let i = 0; i < sizes[l]; i++) { await nav({ name: 'game', lesson: l, index: i }); await shot(`${l}-game${i}`, 1600); }
    await nav({ name: 'lesson', lesson: l, stage: 5 }); await shot(`${l}-stage5-sing`, 1200);
  }
  // mark all lessons taught so exams have every lesson available
  await page.evaluate(() => { const s = globalThis.__app.getState(); ['L1','L2','L3','L4','L5','L6','L7','L8','L9'].forEach((id) => s.saveLesson({ ...s.lessonState(id), taught: true, status: 'completed', stars: 2 })); s.addStars(30, 'test'); });
  for (const m of ['mock', 'revision', 'picture', 'oral']) { await nav({ name: 'exam', mode: m }); await shot(`exam-${m}`, 5500); }
  await nav({ name: 'lesson', lesson: 'L3', stage: 6 }); await shot('L3-stage6-exam', 5500);
  await nav({ name: 'lesson', lesson: 'L3', stage: 7 }); await shot('L3-stage7-celebrate', 2500);
  for (const r of ['worlds', 'play', 'revision', 'exams', 'rewards', 'songs', 'done']) { await nav({ name: r }); await shot(`screen-${r}`, 1500); }
  await nav({ name: 'world', world: 'food' }); await shot('screen-world-food');
  await nav({ name: 'parentGate' }); await shot('parent-gate');
  for (const t of ['Overview', 'Profile', 'Photos', 'Progress', 'Exams', 'Routine', 'Sound & voice', 'Reset']) {
    await nav({ name: 'parent' });
    await page.waitForTimeout(500);
    await page.getByText(t, { exact: true }).first().click({ force: true });
    await shot(`parent-${t.replace(/\W+/g, '_')}`, 900);
  }
  await nav({ name: 'parent' });
  await page.getByText('Photos', { exact: true }).first().click({ force: true });
  await page.waitForTimeout(500);
  try { await page.getByText('Adjust markers').first().click({ force: true, timeout: 5000 }); await shot('parent-marker-editor', 1000); }
  catch (e) { logs.push('marker editor not reached: ' + e.message.split('\n')[0]); }
  fs.writeFileSync(`${out}/console.txt`, logs.join('\n'));
  console.log(`console issues: ${logs.length}`);
  console.log([...new Set(logs)].slice(0, 40).join('\n'));
  await browser.close();
})();
