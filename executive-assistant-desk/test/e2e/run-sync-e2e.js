/*
 * End-to-end sync test: the real desktop app (Electron) and the Android app's screens
 * (mobile/www in Chromium at phone size, with Capacitor's web fallbacks) signed in to
 * the same account on the Firebase emulators.
 *
 *   npm run test:sync-e2e        (starts the emulators, needs `npm run build:www` in mobile/)
 */
const { _electron: electron, chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const TZ = require('../../src/shared/tz');

const ROOT = path.join(__dirname, '..', '..');
const WWW = path.join(ROOT, 'mobile', 'www');
const SHOTS = process.argv[2] || path.join(os.tmpdir(), 'ead-sync-shots');
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ead-sync-pc-'));
const EMU = 'http://127.0.0.1:9099,http://127.0.0.1:8080';
const EMAIL = `assistant${Date.now()}@example.com`;
const MIN = 60000;
fs.mkdirSync(SHOTS, { recursive: true });

const step = (msg) => console.log('  ✓ ' + msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000, what = '') {
  const t = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t > ms) throw new Error('timed out waiting for ' + (what || fn.toString()));
    await sleep(250);
  }
}

function serveWww() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    const p = path.join(WWW, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
    if (!p.startsWith(WWW) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', types[path.extname(p)] || 'application/octet-stream');
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function launchDesktop() {
  const app = await electron.launch({
    executablePath: process.env.EAD_E2E_EXE || require('electron'),
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...(process.env.EAD_E2E_EXE ? [] : [ROOT])],
    env: { ...process.env, EAD_TEST: '1', EAD_USER_DATA: USER_DATA, EAD_SYNC_EMULATOR: EMU },
  });
  let page = null;
  for (let i = 0; i < 100 && !page; i++) {
    page = app.windows().find((w) => w.url().endsWith('/index.html')) || null;
    if (!page) await sleep(200);
  }
  await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
  return { app, page };
}

async function signIn(page, create) {
  await page.click('[data-view=settings]');
  await page.fill('#sync-email', EMAIL);
  await page.fill('#sync-password', 'Board-2026!');
  await page.click(create ? '#btn-sign-up' : '#btn-sign-in');
  await page.waitForSelector('#sync-account:not([hidden])', { timeout: 20000 });
}

const state = (page) => page.evaluate(() => window.desk.getState());

(async () => {
  console.log('Sync E2E, account', EMAIL);
  const server = await serveWww();
  const phoneUrl = `http://127.0.0.1:${server.address().port}/index.html?test=1&emu=${encodeURIComponent(EMU)}`;

  // ---------- Desktop: create account, add data ----------
  let { app, page: pc } = await launchDesktop();
  await pc.evaluate(() => window.desk.saveTask({ title: 'Send board packet to directors', dueDate: Tasks.localDateStr(Date.now()), priority: 'high' }));
  await signIn(pc, true);
  await pc.screenshot({ path: path.join(SHOTS, 'desktop-account.png') });
  step('desktop: account created with email + password, status shows signed in');

  const start = Math.ceil((Date.now() + 3 * 60 * MIN) / MIN) * MIN;
  await pc.evaluate((m) => window.desk.saveMeeting(m), {
    title: 'Budget review with the Executive Director', date: TZ.dateIn(start, 'Africa/Lagos'), time: TZ.timeIn(start, 'Africa/Lagos'),
    timeZone: 'Africa/Lagos', duration: 60, link: 'https://zoom.us/j/123',
  });
  await until(async () => (await state(pc)).sync.pending === 0, 20000, 'desktop upload');
  step('desktop: meeting uploaded automatically after saving');

  // ---------- Phone: sign in with the same email ----------
  const chrome = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find((p) => p && fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  phone.on('pageerror', (e) => console.error('phone page error:', e.message));
  await phone.goto(phoneUrl);
  await phone.waitForSelector('body[data-ready="1"]');
  assert.equal((await state(phone)).platform, 'android');
  await signIn(phone, false);
  await until(async () => (await state(phone)).meetings.length === 1, 20000, 'phone download');
  const ps = await state(phone);
  assert.equal(ps.meetings[0].title, 'Budget review with the Executive Director');
  assert.equal(ps.tasks[0].title, 'Send board packet to directors');
  await phone.click('[data-view=dashboard]');
  await phone.screenshot({ path: path.join(SHOTS, 'phone-dashboard.png'), fullPage: false });
  step('phone: signed in with the same email and received the meeting and task');

  // Notifications planned for the meeting (these fire even when the app is closed).
  const plan = await phone.evaluate(() => window.desk.test.scheduled());
  const forMeeting = plan.filter((p) => p.instance.startsWith('m:') && !p.repeat);
  assert.equal(forMeeting.length, 4);
  assert.deepEqual(forMeeting.map((p) => Math.round((start - p.at) / 60000)), [30, 20, 10, 5]);
  step('phone: 4 Android notifications scheduled (30/20/10/5 min) so reminders come even when the app is closed');

  // ---------- Phone edits sync back ----------
  await phone.check('#today-tasks .task:has-text("Send board packet") input[type=checkbox]');
  await until(async () => (await state(phone)).sync.pending === 0, 20000, 'phone upload');
  await pc.evaluate(() => window.desk.syncNow());
  await until(async () => (await state(pc)).tasks[0].completed === true, 20000, 'desktop got completion');
  step('phone → desktop: task completed on the phone shows completed on the desktop');

  // ---------- Desktop switched off; phone keeps working offline ----------
  await pc.evaluate(() => window.desk.test.quit()).catch(() => {});
  await app.waitForEvent('close', { timeout: 10000 }).catch(() => app.close());
  await ctx.setOffline(true);
  await phone.evaluate(() => window.desk.saveTask({ title: 'Call the caterer (added offline)', dueDate: Tasks.localDateStr(Date.now()) }));
  await phone.evaluate(() => window.desk.syncNow()).catch(() => {});
  const off = await state(phone);
  assert.equal(off.tasks.length, 2);
  assert.ok(off.sync.pending >= 1);
  await phone.click('[data-view=dashboard]');
  await phone.screenshot({ path: path.join(SHOTS, 'phone-offline.png') });
  step(`phone offline with the desktop off: still works, ${off.sync.pending} change waiting ("${(await phone.textContent('#btn-sync')).trim()}")`);
  await ctx.setOffline(false);
  await phone.evaluate(() => window.dispatchEvent(new Event('online')));
  await until(async () => (await state(phone)).sync.pending === 0, 20000, 'phone upload after reconnect');
  step('phone back online: change uploaded automatically');

  // ---------- Desktop turned on again: catches up ----------
  ({ app, page: pc } = await launchDesktop());
  await until(async () => (await state(pc)).tasks.some((t) => t.title.startsWith('Call the caterer')), 20000, 'desktop catch-up');
  step('desktop restarted: still signed in and received what was added on the phone while it was off');

  // ---------- Reschedule on desktop → phone notifications recalculated ----------
  const start2 = start + 60 * MIN;
  const m = (await state(pc)).meetings[0];
  await pc.evaluate((x) => window.desk.saveMeeting(x), { ...m, date: TZ.dateIn(start2, 'Africa/Lagos'), time: TZ.timeIn(start2, 'Africa/Lagos') });
  await until(async () => (await state(pc)).sync.pending === 0);
  await phone.evaluate(() => window.desk.syncNow());
  await until(async () => (await state(phone)).meetings[0].startUtc === start2, 20000, 'phone got reschedule');
  const plan2 = (await phone.evaluate(() => window.desk.test.scheduled())).filter((p) => p.instance.startsWith('m:') && !p.repeat);
  assert.deepEqual(plan2.map((p) => Math.round((start2 - p.at) / 60000)), [30, 20, 10, 5]);
  step('desktop reschedule → phone notifications moved to the new time');

  // ---------- Attention mode on both; acknowledge on the phone stops the desktop ----------
  for (const pg of [pc, phone]) await pg.evaluate(() => window.desk.updateSettings({ attentionEnabled: true, repeatSeconds: 30, alarmSeconds: 2 }));
  const planAtt = await phone.evaluate(() => window.desk.test.scheduled());
  assert.ok(planAtt.some((p) => p.repeat && p.attention), 'repeat notifications pre-scheduled for attention mode');
  step('phone: attention mode pre-schedules alarm notifications that repeat until acknowledged');

  const at30 = start2 - 30 * MIN + 1000;
  await pc.evaluate((ms) => window.desk.test.setClockOffset(ms), at30 - Date.now());
  await phone.evaluate((ms) => window.desk.test.setClockOffset(ms), at30 - Date.now());
  await until(async () => (await state(pc)).reminders.active.some((x) => x.needsAck), 15000, 'desktop alert');
  await phone.waitForSelector('#attention-overlay:not([hidden]) .ov-ack', { timeout: 15000 });
  await phone.screenshot({ path: path.join(SHOTS, 'phone-attention.png') });
  step('both devices alerting (desktop flashing window, phone full-screen flashing alert)');

  await phone.click('#attention-overlay .ov-ack');
  await phone.waitForSelector('#attention-overlay[hidden]', { state: 'attached' });
  await until(async () => (await state(phone)).sync.pending === 0);
  await pc.evaluate(() => window.desk.syncNow());
  await until(async () => !(await state(pc)).reminders.active.some((x) => x.needsAck), 20000, 'desktop alarm stopped');
  const planAfterAck = await phone.evaluate(() => window.desk.test.scheduled());
  assert.ok(!planAfterAck.some((p) => p.repeat && p.at < start2 - 20 * MIN), 'repeat notifications for the acknowledged alert were cancelled');
  step('Acknowledge on the phone → desktop alarm stops (synced) and the phone cancels its repeat notifications');

  // ---------- App closed on the phone: reminders delivered by Android, not "missed" ----------
  await phone.evaluate(() => window.desk.test.simulateBackground());
  const at10 = start2 - 10 * MIN + 30000;
  await phone.evaluate((ms) => window.desk.test.setClockOffset(ms), at10 - Date.now());
  await phone.evaluate(() => window.desk.test.simulateResume());
  const ps2 = await state(phone);
  assert.equal(ps2.reminders.missed.length, 0, 'not reported as missed: Android showed them as notifications');
  assert.ok(ps2.reminders.active.some((x) => x.instance.startsWith('m:')), 'latest reminder shown in the app when reopened');
  step('phone app closed during the 20- and 10-minute reminders: delivered by Android, shown on reopening, not listed as missed');

  await pc.evaluate(() => window.desk.test.quit()).catch(() => {});
  await app.waitForEvent('close', { timeout: 10000 }).catch(() => app.close());
  await browser.close();
  server.close();
  fs.rmSync(USER_DATA, { recursive: true, force: true });
  console.log('\nSync E2E passed. Screenshots in', SHOTS);
})().catch((e) => {
  console.error('\nSYNC E2E FAILED:', e);
  process.exit(1);
});
