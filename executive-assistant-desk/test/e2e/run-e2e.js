/*
 * End-to-end check of the real Electron app (run under a virtual display on Linux CI,
 * or directly on Windows): adds meetings and tasks through the UI, forces the app clock
 * forward to trigger reminders, restarts the app to confirm everything was saved, and
 * simulates waking from sleep to confirm missed reminders are listed but not spoken.
 *
 *   node test/e2e/run-e2e.js [screenshotDir]
 */
const { _electron: electron } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const TZ = require('../../src/shared/tz');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2] || path.join(os.tmpdir(), 'ead-e2e-shots');
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'ead-e2e-data-'));
const MIN = 60000;
fs.mkdirSync(SHOTS, { recursive: true });

async function launch(extraEnv = {}) {
  const app = await electron.launch({
    // EAD_E2E_EXE runs the checks against a packaged build instead of the source folder.
    executablePath: process.env.EAD_E2E_EXE || require('electron'),
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...(process.env.EAD_E2E_EXE ? [] : [ROOT])],
    env: { ...process.env, EAD_TEST: '1', EAD_USER_DATA: USER_DATA, ...extraEnv },
  });
  const page = await app.firstWindow();
  await page.waitForSelector('body[data-ready="1"]', { timeout: 20000 });
  await page.setViewportSize({ width: 1320, height: 900 }).catch(() => {});
  return { app, page };
}

async function quit(app, page) {
  await page.evaluate(() => window.desk.test.quit()).catch(() => {});
  await app.waitForEvent('close', { timeout: 10000 }).catch(() => app.close());
}

const step = (msg) => console.log('  ✓ ' + msg);

(async () => {
  console.log('E2E run, data folder:', USER_DATA);
  let { app, page } = await launch();

  // --- Clocks ---
  const clocks = await page.$$eval('.clock', (els) => els.map((e) => ({
    zone: e.dataset.zone, time: e.querySelector('[data-part=time]').textContent, date: e.querySelector('[data-part=date]').textContent,
    meta: e.querySelector('[data-part=meta]').textContent,
  })));
  assert.deepEqual(clocks.map((c) => c.zone), ['Africa/Lagos', 'America/Toronto', 'America/New_York']);
  for (const c of clocks) assert.match(c.time, /\d{1,2}:\d{2}:\d{2} (AM|PM)/);
  step('three live clocks: ' + clocks.map((c) => `${c.zone} ${c.time} (${c.meta})`).join(' | '));

  // --- Add a meeting 40 minutes ahead (Lagos time) through the dialog ---
  const realNow = Date.now();
  const start = Math.ceil((realNow + 40 * MIN) / MIN) * MIN;
  await page.click('#btn-add-meeting');
  await page.fill('#meeting-form [name=title]', 'Budget review with the Executive Director');
  await page.selectOption('#meeting-zone', 'Africa/Lagos');
  await page.fill('#meeting-form [name=date]', TZ.dateIn(start, 'Africa/Lagos'));
  await page.fill('#meeting-form [name=time]', TZ.timeIn(start, 'Africa/Lagos'));
  await page.fill('#meeting-form [name=link]', 'https://zoom.us/j/123456');
  await page.fill('#meeting-form [name=notes]', 'Bring Q3 variance report.');
  await page.screenshot({ path: path.join(SHOTS, '2-add-meeting.png') });
  await page.click('#meeting-submit');
  await page.waitForSelector('#today-meetings .card, #next-meetings .card');
  const equivs = await page.$$eval('.card .equiv-zone', (els) => els.map((e) => e.textContent));
  assert.ok(equivs.some((t) => t.includes('Nigeria')) && equivs.some((t) => t.includes('Scarborough')) && equivs.some((t) => t.includes('New York')));
  step('meeting added via dialog; card shows Nigeria / Scarborough / New York times');

  // --- Date-difference marker: 23:30 in Toronto is the next day in Lagos ---
  await page.click('#btn-add-meeting');
  await page.fill('#meeting-form [name=title]', 'Late call with Toronto office');
  await page.selectOption('#meeting-zone', 'America/Toronto');
  const tomorrowToronto = TZ.dateIn(realNow + 24 * 60 * MIN, 'America/Toronto');
  await page.fill('#meeting-form [name=date]', tomorrowToronto);
  await page.fill('#meeting-form [name=time]', '23:30');
  const previewBadge = await page.textContent('#meeting-preview');
  assert.match(previewBadge, /Next day/);
  await page.click('#meeting-submit');
  step('23:30 Toronto meeting shows "Next day" for Nigeria in the preview');

  // --- Tasks: add, complete, reopen ---
  const today = await page.evaluate(() => Tasks.localDateStr(Date.now()));
  const yesterday = await page.evaluate(() => Tasks.localDateStr(Date.now() - 864e5));
  await page.click('#btn-add-task');
  await page.fill('#task-form [name=title]', 'Send board packet to directors');
  await page.fill('#task-form [name=dueDate]', today);
  await page.selectOption('#task-form [name=priority]', 'high');
  await page.click('#task-form button[type=submit]');
  await page.click('#btn-add-task');
  await page.fill('#task-form [name=title]', 'Confirm caterer for retreat');
  await page.fill('#task-form [name=dueDate]', yesterday);
  await page.click('#task-form button[type=submit]');
  await page.waitForSelector('#today-tasks .task.overdue');
  step('overdue task is shown in the Overdue section of the daily checklist');
  await page.check('#today-tasks .task:has-text("Send board packet") input[type=checkbox]');
  await page.waitForSelector('#today-tasks .task.completed:has-text("Send board packet")');
  let progress = await page.textContent('#today-tasks .progress-text');
  assert.equal(progress, '1 of 2 done today');
  step('checkbox completes a task: ' + progress);
  await page.click('[data-view=tasks]');
  await page.click('#tasks-all .task.completed [data-act=reopen-task]');
  await page.waitForSelector('#tasks-all .task.today:has-text("Send board packet")');
  step('Reopen moves the task back to Due today');
  await page.click('[data-view=dashboard]');
  await page.check('#today-tasks .task:has-text("Send board packet") input[type=checkbox]');
  await page.waitForSelector('#today-tasks .task.completed:has-text("Send board packet")');

  // --- Settings persisted later ---
  await page.evaluate(() => window.desk.updateSettings({ volume: 0.55, voiceName: 'Test Voice' }));

  // --- Reminder fires: jump the app clock to 2 s after the 30-minute mark ---
  await page.evaluate((ms) => window.desk.test.setClockOffset(ms), start - 30 * MIN + 2000 - Date.now());
  await page.waitForSelector('.active-alert', { timeout: 15000 });
  let log = await page.evaluate(() => window.__speech.log.map((e) => e.text));
  assert.deepEqual(log, ['Reminder: Budget review with the Executive Director starts in 30 minutes.']);
  await page.screenshot({ path: path.join(SHOTS, '1-dashboard-reminder.png') });
  step('30-minute reminder announced: "' + log[0] + '"');

  // Repeated ticks do not repeat it.
  await page.evaluate(() => window.desk.test.tick());
  await page.evaluate(() => window.desk.test.tick());
  log = await page.evaluate(() => window.__speech.log.map((e) => e.text));
  assert.equal(log.length, 1);
  step('no duplicate announcement on repeated checks');

  // Snooze hides the alert and replays it later.
  await page.click('.active-alert [data-act=snooze]');
  await page.waitForSelector('.active-alert', { state: 'detached' });
  await page.evaluate((ms) => window.desk.test.setClockOffset(ms), start - 25 * MIN + 2000 - Date.now());
  await page.waitForSelector('.active-alert', { timeout: 15000 });
  log = await page.evaluate(() => window.__speech.log.map((e) => e.text));
  assert.equal(log[1], 'Reminder: Budget review with the Executive Director starts in 25 minutes.');
  step('snooze (5 min) replays: "' + log[1] + '"');

  // 20-minute reminder at the right time.
  await page.evaluate((ms) => window.desk.test.setClockOffset(ms), start - 20 * MIN + 1000 - Date.now());
  await page.waitForFunction(() => window.__speech.log.length === 3, null, { timeout: 15000 });
  log = await page.evaluate(() => window.__speech.log.map((e) => e.text));
  assert.equal(log[2], 'Reminder: Budget review with the Executive Director starts in 20 minutes.');
  step('20-minute reminder announced on time');

  await page.click('[data-view=meetings]');
  await page.screenshot({ path: path.join(SHOTS, '3-meetings.png') });
  await page.click('[data-view=tasks]');
  await page.screenshot({ path: path.join(SHOTS, '4-tasks.png') });
  await page.click('[data-view=settings]');
  await page.screenshot({ path: path.join(SHOTS, '5-settings.png') });
  await quit(app, page);

  // --- Restart "after sleep": app comes back 7 minutes before the meeting ---
  ({ app, page } = await launch({ EAD_CLOCK_OFFSET_MS: String(start - 7 * MIN - Date.now()) }));
  const state = await page.evaluate(() => window.desk.getState());
  assert.equal(state.meetings.length, 2);
  assert.equal(state.tasks.length, 2);
  assert.equal(state.tasks.find((t) => t.title.startsWith('Send board')).completed, true);
  assert.equal(state.settings.volume, 0.55);
  step('after restart: 2 meetings, 2 tasks, completed state and settings were all kept');
  await page.waitForSelector('.missed-alert', { timeout: 15000 });
  const missedText = await page.textContent('.missed-alert');
  assert.match(missedText, /10-minute reminder/);
  log = await page.evaluate(() => window.__speech.log.map((e) => e.text));
  assert.equal(log.length, 0, 'nothing spoken for expired reminders');
  await page.screenshot({ path: path.join(SHOTS, '6-missed-after-restart.png') });
  step('missed 10-minute reminder listed after restart, nothing spoken');

  // 5-minute reminder still plays.
  await page.evaluate((ms) => window.desk.test.setClockOffset(ms), start - 5 * MIN + 1000 - Date.now());
  await page.waitForFunction(() => window.__speech.log.length === 1, null, { timeout: 15000 });
  log = await page.evaluate(() => window.__speech.log.map((e) => e.text));
  assert.equal(log[0], 'Reminder: Budget review with the Executive Director starts in 5 minutes.');
  step('5-minute reminder announced after restart');

  // Cancel meeting: no more reminders, card shows Cancelled.
  await page.click('[data-view=meetings]');
  await page.click('#meetings-list .card:has-text("Budget review") [data-act=cancel-meeting]');
  await page.click('#confirm-yes');
  await page.selectOption('#meeting-filter', 'cancelled');
  await page.waitForSelector('#meetings-list .card.cancelled');
  step('meeting cancelled');

  // ================= Attention mode =================
  const hooks = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => { hooks.push({ headers: req.headers, body: JSON.parse(body) }); res.end('ok'); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const hookUrl = `http://127.0.0.1:${server.address().port}/buzz`;

  const visibleAttention = () => app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((w) => w.getTitle().startsWith('Reminder') && w.isVisible()));
  const attentionPage = app.windows().find((w) => w.url().includes('attention.html'));
  assert.ok(attentionPage, 'attention window exists');
  const until = async (fn, ms = 15000) => {
    const t = Date.now();
    while (Date.now() - t < ms) { if (await fn()) return; await new Promise((r) => setTimeout(r, 200)); }
    throw new Error('timed out: ' + fn.toString());
  };
  const speechLog = () => page.evaluate(() => window.__speech.log.map((e) => ({ text: e.text, alarm: !!e.alarm, skipped: !!e.skipped })));

  await page.click('[data-view=settings]');
  await page.check('#set-attention');
  await page.selectOption('#set-repeat', '30');
  await page.selectOption('#set-alarm-seconds', '2');
  await page.selectOption('#set-webhook-type', 'json');
  await page.fill('#set-webhook-url', hookUrl);
  await page.press('#set-webhook-url', 'Tab');
  await page.check('#set-webhook');
  await until(async () => (await page.evaluate(() => window.desk.getState())).settings.webhookEnabled);
  await page.screenshot({ path: path.join(SHOTS, '7-attention-settings.png') });
  step('attention mode, 30 s repeat and a vibration push address set in Settings');

  // Test button: full sequence.
  const logStart = (await speechLog()).length;
  await page.click('#btn-test-attention');
  await until(visibleAttention);
  await attentionPage.waitForSelector('body.flash button.ack');
  await until(async () => (await speechLog()).length > logStart);
  let entry = (await speechLog())[logStart];
  assert.equal(entry.alarm, true);
  assert.equal(entry.text, 'Reminder: Budget review with the Executive Director starts in 20 minutes.');
  await until(async () => (await page.evaluate(() => window.Alarm.log.length)) >= 1);
  await until(async () => hooks.length >= 1);
  assert.equal(hooks[0].body.vibrate, true);
  await attentionPage.screenshot({ path: path.join(SHOTS, '8-attention-alert.png') });
  step('Test attention alert: alarm, then voice, flashing on-top window, vibration push sent');

  // It repeats until acknowledged.
  const offsetNow = (await page.evaluate(() => window.desk.getState())).clockOffset;
  await page.evaluate((ms) => window.desk.test.setClockOffset(ms), offsetNow + 21000);
  await until(async () => (await speechLog()).filter((e) => e.alarm).length >= 2);
  await until(async () => hooks.length >= 2);
  step('test alert repeated after 20 s (alarm + voice + push again)');
  await attentionPage.click('button.ack');
  await until(async () => !(await visibleAttention()));
  const alarmsAfterAck = (await speechLog()).filter((e) => e.alarm).length;
  await page.evaluate((ms) => window.desk.test.setClockOffset(ms), offsetNow + 45000);
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal((await speechLog()).filter((e) => e.alarm).length, alarmsAfterAck);
  step('Acknowledge closes the alert and stops the repeats');

  // A real meeting in attention mode.
  const st0 = await page.evaluate(() => window.desk.getState());
  const appNow = Date.now() + st0.clockOffset;
  const start2 = Math.ceil((appNow + 45 * MIN) / MIN) * MIN;
  await page.evaluate((m) => window.desk.saveMeeting(m), {
    title: 'Board chair call', date: TZ.dateIn(start2, 'America/New_York'), time: TZ.timeIn(start2, 'America/New_York'),
    timeZone: 'America/New_York', duration: 30, link: 'https://teams.example.com/meet/1',
  });
  const hooksBefore = hooks.length;
  await page.evaluate((ms) => window.desk.test.setClockOffset(ms), start2 - 30 * MIN + 1000 - Date.now());
  await until(visibleAttention);
  await attentionPage.waitForSelector('.item:has-text("Board chair call")');
  await until(async () => hooks.length > hooksBefore);
  assert.match(hooks[hooks.length - 1].body.message, /Board chair call starts in 30 minutes/);
  await page.click('[data-view=dashboard]');
  await page.waitForSelector('.active-alert.needs-ack.flash');
  await page.screenshot({ path: path.join(SHOTS, '9-dashboard-attention.png') });
  step('meeting reminder in attention mode: flashing window + flashing banner + push');

  await page.evaluate((ms) => window.desk.test.setClockOffset(ms), start2 - 30 * MIN + 31000 - Date.now());
  await until(async () => (await speechLog()).some((e) => e.alarm && /Board chair call starts in 29 minutes/.test(e.text)));
  step('repeated 30 s later ("starts in 29 minutes")');
  await page.click('.active-alert [data-act=acknowledge]');
  await until(async () => !(await visibleAttention()));
  const st1 = await page.evaluate(() => window.desk.getState());
  assert.equal(st1.reminders.active.length, 1, 'banner remains after acknowledging');
  assert.equal(st1.reminders.active[0].needsAck, false);
  step('Acknowledge from the main window stops the alarm; banner stays for Snooze/Dismiss/Join');

  // Mute silences alarm + voice but the alert still appears.
  await page.evaluate(() => window.desk.updateSettings({ muted: true }));
  await page.evaluate((ms) => window.desk.test.setClockOffset(ms), start2 - 20 * MIN + 1000 - Date.now());
  await until(visibleAttention);
  await until(async () => (await speechLog()).some((e) => /starts in 20 minutes/.test(e.text) && e.skipped));
  step('while muted: alert window still appears, alarm and voice are silent');
  await attentionPage.click('button.ack');

  server.close();
  await quit(app, page);
  fs.rmSync(USER_DATA, { recursive: true, force: true });
  console.log('\nE2E passed. Screenshots in', SHOTS);
})().catch((e) => {
  console.error('\nE2E FAILED:', e);
  process.exit(1);
});
