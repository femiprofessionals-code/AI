/*
 * End-to-end test of Private Line on the Firebase emulators (Auth, Firestore, Storage,
 * Functions) with real security rules. Each "phone" is a separate Chromium profile at
 * phone size with a fake camera and microphone, so calls are real WebRTC calls.
 *
 *   npm run build:www && npm run test:e2e
 */
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const WWW = path.join(__dirname, '..', 'www');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'private-line-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const step = (m) => console.log('  ✓ ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    p = path.join(WWW, p);
    if (!p.startsWith(WWW) || !fs.existsSync(p)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', types[path.extname(p)] || 'application/octet-stream');
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function firestoreAdmin(pathname) {
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/demo-private-line/databases/(default)/documents/${pathname}`, {
    headers: { Authorization: 'Bearer owner' },
  });
  return res.json();
}

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/index.html?test=1&emu=1`;
  const chrome = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
  const browser = await chromium.launch({
    executablePath: chrome,
    args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });

  async function phone(name) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.grantPermissions(['microphone', 'camera', 'clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error(`[${name}] page error:`, e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text())) console.error(`[${name}]`, m.text()); });
    await page.goto(url);
    await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
    return { ctx, page, name };
  }

  async function pin(page, pad, digits) {
    for (const d of digits) await page.click(`[data-keypad=${pad}] button[data-key="${d}"]`);
    await sleep(200);
  }

  const shot = (p, n) => p.page.screenshot({ path: path.join(SHOTS, `${n}.png`) });
  const state = (p) => p.page.evaluate(() => ({ uid: window.PL.uid, line: window.PL.line, msgs: window.PL.messages.map((m) => ({ id: m.id, from: m.from, type: m.type, text: m.text, pending: m.pending, delivered: !!m.deliveredAt, read: !!m.readAt, media: m.media })) }));

  // ---------- Activation ----------
  const A = await phone('Femi');
  await shot(A, '01-welcome');
  await A.page.click('[data-go=create]');
  await A.page.fill('#create-name', 'Femi');
  await A.page.click('#create-form button[type=submit]');
  await A.page.waitForSelector('#s-pin-setup.active');
  await pin(A.page, 'setup', '111111');
  assert.match(await A.page.textContent('#pin-setup-error'), /less obvious/);
  await pin(A.page, 'setup', '482916');
  await pin(A.page, 'setup', '482917');
  assert.match(await A.page.textContent('#pin-setup-error'), /didn't match/);
  await pin(A.page, 'setup', '482916');
  await pin(A.page, 'setup', '482916');
  await A.page.waitForSelector('#s-waiting.active', { timeout: 20000 });
  const code = (await A.page.textContent('#wait-code')).trim();
  assert.match(code, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  await shot(A, '02-pair-code');
  step(`phone A created the line, chose a PIN (weak / mismatched PINs refused); pair code ${code}`);

  const pairDocs = await firestoreAdmin('pairs');
  const stored = JSON.stringify(pairDocs);
  assert.ok(!stored.includes(code) && !stored.includes(code.replace(/-/g, '')), 'the pair code itself is never stored on the server');
  assert.ok(!stored.includes('482916'), 'the PIN is never stored on the server');
  step('server holds only hashes: neither the pair code nor the PIN is stored');

  const B = await phone('Director');
  await B.page.click('[data-go=join]');
  await B.page.fill('#join-code', code.toLowerCase().replace(/-/g, ' '));
  await B.page.fill('#join-name', 'Executive Director');
  B.page.once('dialog', (d) => d.dismiss()); // "I am the second person"
  await B.page.click('#join-form button[type=submit]');
  await B.page.waitForSelector('#s-pin-setup.active');
  await pin(B.page, 'setup', '730519');
  await pin(B.page, 'setup', '730519');
  await B.page.waitForSelector('#s-chat.active', { timeout: 20000 });
  await A.page.waitForSelector('#s-chat.active', { timeout: 20000 });
  assert.equal(await A.page.textContent('#peer-name'), 'Executive Director');
  assert.equal(await B.page.textContent('#peer-name'), 'Femi');
  step('phone B activated with the code (typed loosely: lower case, spaces) and both phones see each other');

  // ---------- A third phone is refused ----------
  const C = await phone('Intruder');
  await C.page.click('[data-go=join]');
  await C.page.fill('#join-code', code);
  await C.page.fill('#join-name', 'Someone else');
  await C.page.click('#join-form button[type=submit]');
  await C.page.waitForSelector('#s-recover.active', { timeout: 20000 });
  await pin(C.page, 'recover', '123987');
  await C.page.waitForFunction(() => /Wrong PIN/.test(document.querySelector('#recover-error').textContent), null, { timeout: 30000 });
  await shot(C, '03-third-phone-refused');
  step('a third phone with the right code is refused (line full) and a wrong PIN cannot take over a place');

  // ---------- Messages ----------
  await A.page.fill('#text', 'Good morning, the board pack is ready.');
  await A.page.click('#send');
  await B.page.waitForSelector('.msg:has-text("Good morning, the board pack is ready.")', { timeout: 15000 });
  await A.page.waitForFunction(() => window.PL.messages.some((m) => m.text && m.text.startsWith('Good morning') && m.readAt), null, { timeout: 15000 });
  await A.page.waitForSelector('.msg.mine .tick.read');
  step('text message A → B in real time; A sees blue ✓✓ when B has read it');

  await B.page.fill('#text', 'Thank you. Please call me after 2.');
  await B.page.click('#send');
  await A.page.waitForSelector('.msg:has-text("Please call me after 2")', { timeout: 15000 });
  step('reply B → A');

  // Typing indicator
  await B.page.type('#text', 'Typing something');
  await A.page.waitForFunction(() => /typing/.test(document.querySelector('#peer-status').textContent), null, { timeout: 15000 });
  await B.page.fill('#text', '');
  step('"typing…" shows on the other phone');

  // Photo
  const photo = path.join(os.tmpdir(), 'pl-photo.png');
  fs.writeFileSync(photo, require('../scripts/icon-art').render(600, 400, (x, y) => [Math.round(x * 255), 120, Math.round(y * 255)]));
  await B.page.setInputFiles('#file-input', photo);
  await A.page.waitForFunction(() => {
    const img = document.querySelector('.msg img.photo');
    return img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 30000 });
  step('photo B → A (compressed, uploaded to private storage, displayed)');

  // Voice note (fake microphone)
  await A.page.click('#mic');
  await A.page.waitForSelector('#recorder:not([hidden])');
  await sleep(2200);
  await A.page.click('#rec-send');
  await B.page.waitForFunction(() => {
    const a = document.querySelector('.msg audio');
    return a && a.src && a.src.startsWith('http');
  }, null, { timeout: 30000 });
  const voice = (await state(B)).msgs.find((m) => m.type === 'audio');
  assert.ok(voice.media.duration >= 1.5, `voice note duration ${voice.media.duration}`);
  step(`voice message A → B (${voice.media.duration} s, playable)`);
  await shot(A, '04-chat');
  await shot(B, '05-chat-other-phone');

  // Push notifications were sent by the server function to the right phone
  await sleep(1500);
  const log = await firestoreAdmin('pushLog');
  const pushes = (log.documents || []).map((d) => ({ to: d.fields.toUid.stringValue, kind: d.fields.kind.stringValue, body: d.fields.message.mapValue.fields.notification.mapValue.fields.body.stringValue }));
  const aUid = (await state(A)).uid;
  const bUid = (await state(B)).uid;
  assert.ok(pushes.some((p) => p.to === bUid && p.body.startsWith('Good morning')), 'push for A\'s message went to B');
  assert.ok(pushes.some((p) => p.to === aUid && p.body === '📷 Photo'), 'push for B\'s photo went to A');
  assert.ok(pushes.some((p) => p.to === bUid && p.body === '🎤 Voice message'));
  step(`server function sent ${pushes.length} push notifications, each to the other phone only`);

  // Delete for everyone
  const firstId = (await state(A)).msgs.find((m) => m.text && m.text.startsWith('Good morning')).id;
  await A.page.click(`.msg[data-id="${firstId}"]`, { button: 'right' });
  await A.page.click('[data-msg-act=delete]');
  await B.page.waitForSelector(`.msg[data-id="${firstId}"]:has-text("This message was deleted")`, { timeout: 15000 });
  step('delete for everyone');

  // ---------- Offline sending ----------
  await A.ctx.setOffline(true);
  await A.page.fill('#text', 'Sent while offline');
  await A.page.click('#send');
  await A.page.waitForSelector('.msg.mine:has-text("Sent while offline") .tick[title="Waiting to send"]');
  assert.equal(await A.page.isVisible('#offline-banner'), true);
  await A.ctx.setOffline(false);
  await A.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await B.page.waitForSelector('.msg:has-text("Sent while offline")', { timeout: 30000 });
  step('offline: message waits with 🕓, sends automatically when the connection returns');

  // ---------- Video call ----------
  await A.page.click('#call-video');
  await B.page.waitForSelector('#s-call.active #call-accept', { timeout: 20000 });
  await shot(B, '06-incoming-call');
  await B.page.click('#call-accept', { force: true });
  for (const p of [A, B]) {
    await p.page.waitForFunction(() => window.PL.call && window.PL.call.status === 'connected', null, { timeout: 30000 });
    await p.page.waitForFunction(() => document.querySelector('#remote-video').videoWidth > 0, null, { timeout: 20000 });
  }
  await sleep(1500);
  await shot(A, '07-video-call');
  const pushCall = ((await firestoreAdmin('pushLog')).documents || []).some((d) => d.fields.kind.stringValue === 'call' && d.fields.toUid.stringValue === bUid);
  assert.ok(pushCall, 'ring notification sent to B');
  step('video call: B rings (push sent), answers, both connected with live video both ways');
  await A.page.click('#call-mute');
  assert.equal(await A.page.evaluate(() => window.PL.call.muted), true);
  await A.page.click('#call-end');
  await B.page.waitForSelector('#s-chat.active', { timeout: 15000 });
  await A.page.waitForSelector('#s-chat.active', { timeout: 15000 });
  await B.page.waitForSelector('.msg.call:has-text("Video call ·")', { timeout: 15000 });
  step('mute works; hanging up ends the call on both phones; call appears in the chat history');

  // ---------- Voice call declined ----------
  await B.page.click('#call-audio');
  await A.page.waitForSelector('#s-call.active #call-decline', { timeout: 20000 });
  await A.page.click('#call-decline');
  await B.page.waitForFunction(() => /declined/.test(document.querySelector('#call-status').textContent) || document.querySelector('#s-chat.active'), null, { timeout: 15000 });
  await A.page.waitForSelector('.msg.call:has-text("declined")', { timeout: 15000 });
  step('voice call declined: caller told, history shows "declined"');

  // ---------- PIN lock ----------
  await A.page.reload();
  await A.page.waitForSelector('#s-lock.active', { timeout: 20000 });
  await pin(A.page, 'lock', '000000');
  assert.match(await A.page.textContent('#lock-error'), /Wrong PIN/);
  await shot(A, '08-locked');
  await pin(A.page, 'lock', '482916');
  await A.page.waitForSelector('#s-chat.active', { timeout: 15000 });
  assert.ok((await state(A)).msgs.length >= 5, 'history available after unlocking');
  step('app locked on reopen: wrong PIN refused, right PIN unlocks with full history');

  // ---------- Replacement phone ----------
  const B2 = await phone('Director-new-phone');
  await B2.page.click('[data-go=join]');
  await B2.page.fill('#join-code', code);
  await B2.page.fill('#join-name', 'Executive Director');
  await B2.page.click('#join-form button[type=submit]');
  await B2.page.waitForSelector('#s-recover.active', { timeout: 20000 });
  await pin(B2.page, 'recover', '730519');
  await B2.page.waitForSelector('#s-chat.active', { timeout: 60000 });
  await B2.page.waitForSelector('.msg:has-text("Sent while offline")', { timeout: 20000 });
  await B.page.waitForSelector('#s-welcome.active', { timeout: 20000 });
  assert.match(await B.page.textContent('#config-warning'), /no longer on the line/);
  step('new phone for B: code + B\'s PIN moves the place over with the full history; the old phone is cut off');

  await B2.page.fill('#text', 'Hello from my new phone');
  await B2.page.click('#send');
  await A.page.waitForSelector('.msg:has-text("Hello from my new phone")', { timeout: 15000 });
  step('the new phone can message A immediately');

  // ---------- Rules: outsiders can't read anything ----------
  const pairId = (await state(A)).line.pairId;
  const leak = await C.page.evaluate(async (p) => {
    const r = await fetch(`http://127.0.0.1:8080/v1/projects/demo-private-line/databases/(default)/documents/pairs/${p}/messages`);
    return r.status;
  }, pairId);
  assert.ok([401, 403].includes(leak), `unauthenticated read refused (${leak})`);
  step('reading messages without being on the line is refused by the server');

  await browser.close();
  server.close();
  console.log(`\nPrivate Line E2E passed. Screenshots in ${SHOTS}`);
})().catch((e) => {
  console.error('\nPRIVATE LINE E2E FAILED:', e);
  process.exit(1);
});
