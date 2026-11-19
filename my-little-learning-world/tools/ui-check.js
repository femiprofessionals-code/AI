// Visual walkthrough of the web build at tablet size. Serves the exported
// files straight from disk through Playwright (no web server), clicks through
// the main screens, saves screenshots and reports console errors.
// Usage: node tools/ui-check.js <web-export-dir> <out-dir> [steps...]
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
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.route('https://app.local/**', (route) => {
    let p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (p === '/') p = '/index.html';
    const f = path.join(dir, p);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
  });
  await page.goto('https://app.local/');
  await page.waitForTimeout(2500);
  let n = 0;
  const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png` }); };
  const click = async (text, opts = {}) => {
    const loc = page.getByText(text, { exact: opts.exact ?? false }).first();
    await loc.click({ timeout: 5000 });
  };
  const home = async () => { await page.goto('https://app.local/'); await page.waitForTimeout(2000); };

  try {
    await shot('home');
    await click('Continue learning');
    await shot('lesson-welcome');
    await click("Let's learn!");
    await shot('lesson-learn');
    // jump through stages using the stage dots (they become active as she goes)
    for (let k = 0; k < 11; k++) { await page.getByText('➡️').first().click(); await page.waitForTimeout(200); }
    await shot('lesson-explore');
    await click('Next');
    await shot('practice-photo-explore');
    await page.mouse.click(420, 330); // tap on her face area
    await shot('photo-tap');
    await click('Next game');
    await shot('practice-dragmatch');
    await click('Next game');
    await shot('practice-missing');
    await click('Next game');
    await shot('practice-listen');
    await click('Next game');
    await shot('practice-photo-question');
    await click('Sing time!');
    await shot('sing');
    await click('Little exam');
    await page.waitForTimeout(4000);
    await shot('little-exam');
    await home();
    await click('My Learning Worlds');
    await shot('worlds');
    await click('My Amazing Body');
    await shot('world-body');
    await home();
    await click('Play and Practise');
    await shot('play');
    await home();
    await click('Revision Time');
    await shot('revision');
    await home();
    await click('My Rewards');
    await shot('rewards');
  } catch (e) {
    logs.push('walkthrough stopped: ' + e.message.split('\n')[0]);
    await shot('stopped');
  }
  fs.writeFileSync(`${out}/console.txt`, logs.join('\n'));
  console.log(`screens: ${n}, console issues: ${logs.length}`);
  console.log(logs.slice(0, 30).join('\n'));
  await browser.close();
})();
