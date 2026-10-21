// Private Line: screens and flow.
import * as Backend from './backend.js';
import { newPairCode, normalizeCode, formatCodeInput, pinHash, randomSalt } from './crypto.js';
import { createPair, inspectCode, joinPair, recoverPair, updateOwnSlot, watchPair, PairError } from './pairing.js';
import * as Chat from './chat.js';
import { VoiceRecorder } from './recorder.js';
import { Call, watchIncomingCalls, markBusy } from './calls.js';
import * as Native from './native.js';
import { recoveryHash } from './crypto.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const VERSION = '1.0.0';
const PIN_LENGTH = 6;

const S = {
  uid: null,
  line: null, // { pairId, slot, code, name } saved on this phone
  lock: null, // { salt, hash, bio, lockAfter }
  pair: null,
  messages: [],
  uploads: [],
  peerDevice: {},
  unlocked: false,
  active: true,
  hiddenAt: 0,
  call: null,
  replyTo: null,
  pending: null, // activation in progress: { mode: 'create'|'join'|'recover', code, name }
  unsubs: [],
};
window.PL = S; // inspected by the automated tests

/* ---------------- Helpers ---------------- */
function show(id) {
  for (const s of $$('.screen')) s.classList.toggle('active', s.id === `s-${id}`);
  S.screen = id;
  if (id === 'chat') markRead();
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 3200);
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initial = (name) => (String(name || '?').trim()[0] || '?').toUpperCase();
const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function dayLabel(ms) {
  const d = new Date(ms);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

const peerSlot = () => (S.pair && S.line ? S.pair.slots[S.line.slot === 'a' ? 'b' : 'a'] : null);
const mySlot = () => (S.pair && S.line ? S.pair.slots[S.line.slot] : null);

/* ---------------- PIN pads ---------------- */
function keypad(container, onKey) {
  container.innerHTML = '';
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = k;
    b.dataset.key = k;
    if (!k) b.className = 'blank';
    b.setAttribute('aria-label', k === '⌫' ? 'Delete' : k);
    b.addEventListener('click', () => onKey(k));
    container.appendChild(b);
  }
}

function dots(el, n) {
  el.innerHTML = Array.from({ length: PIN_LENGTH }, (_, i) => `<span class="${i < n ? 'on' : ''}"></span>`).join('');
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

/** Collect a PIN on a keypad; calls done(pin) when complete. Returns a reset function. */
function pinEntry(padName, dotsEl, done) {
  let pin = '';
  const reset = () => { pin = ''; dots(dotsEl, 0); };
  keypad($(`[data-keypad=${padName}]`), (k) => {
    if (k === '⌫') pin = pin.slice(0, -1);
    else if (k && pin.length < PIN_LENGTH) pin += k;
    dots(dotsEl, pin.length);
    if (pin.length === PIN_LENGTH) {
      const p = pin;
      setTimeout(() => { reset(); done(p); }, 120);
    }
  });
  reset();
  return reset;
}

/* ---------------- PIN setup (new line, or change PIN) ---------------- */
function setupPin({ title, help, onDone, onBack }) {
  $('#pin-setup-title').textContent = title || 'Choose a PIN';
  $('#pin-setup-help').textContent = help || "This 6-digit PIN locks the app on this phone. You'll also need it, with the pair code, to move to a new phone. Don't forget it.";
  $('#pin-setup-error').textContent = '';
  let first = null;
  pinEntry('setup', $('#pin-setup-dots'), async (pin) => {
    if (!first) {
      if (/^(\d)\1+$/.test(pin) || pin === '123456' || pin === '654321') {
        $('#pin-setup-error').textContent = 'Choose a less obvious PIN.';
        shake($('#pin-setup-dots'));
        return;
      }
      first = pin;
      $('#pin-setup-title').textContent = 'Enter the PIN again';
      $('#pin-setup-error').textContent = '';
      return;
    }
    if (pin !== first) {
      first = null;
      $('#pin-setup-title').textContent = title || 'Choose a PIN';
      $('#pin-setup-error').textContent = "The PINs didn't match. Start again.";
      shake($('#pin-setup-dots'));
      return;
    }
    $('#pin-setup-error').textContent = '';
    await onDone(pin);
  });
  $('#pin-setup-back').onclick = onBack || (() => show('welcome'));
  Native.biometricAvailable().then((ok) => { $('#bio-row').hidden = !ok; });
  show('pin-setup');
}

async function saveLock(pin) {
  const salt = randomSalt();
  S.lock = { salt, hash: await pinHash(pin, salt), bio: !$('#bio-row').hidden && $('#bio-enable').checked, lockAfter: (S.lock && S.lock.lockAfter) ?? 60 };
  await Native.save('pl-lock', S.lock);
}

/* ---------------- Activation ---------------- */
async function startCreate(e) {
  e.preventDefault();
  const name = $('#create-name').value.trim();
  if (!name) { $('#create-error').textContent = 'Enter your name.'; return; }
  S.pending = { mode: 'create', code: newPairCode(), name };
  setupPin({ onDone: finishActivation, onBack: () => show('create') });
}

async function startJoin(e) {
  e.preventDefault();
  const err = $('#join-error');
  err.textContent = '';
  const code = normalizeCode($('#join-code').value);
  const name = $('#join-name').value.trim();
  if (!code) { err.textContent = 'The code has 12 letters and numbers, like K7QX-M2PD-9WTR.'; return; }
  if (!name) { err.textContent = 'Enter your name.'; return; }
  const btn = $('#join-form button[type=submit]');
  btn.disabled = true;
  try {
    const info = await inspectCode(S.uid, code);
    if (info.state === 'mine') {
      // Already activated on this phone (e.g. app data was restored).
      S.line = { pairId: info.pairId, slot: info.slot, code, name };
      S.pending = { mode: 'existing', code, name };
      setupPin({ onDone: finishActivation, onBack: () => show('join') });
    } else if (info.state === 'free') {
      const creator = info.data.slots.a.name;
      const replacing = window.confirm(`This line was created by "${creator}".\n\nOK = I am ${creator} and this is my new phone.\nCancel = I am the second person, joining now.`);
      if (replacing) {
        S.pending = { mode: 'recover', code, name };
        startRecover();
      } else {
        S.pending = { mode: 'join', code, name };
        setupPin({ onDone: finishActivation, onBack: () => show('join') });
      }
    } else {
      S.pending = { mode: 'recover', code, name };
      startRecover();
    }
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
}

function startRecover() {
  $('#recover-error').textContent = '';
  pinEntry('recover', $('#recover-dots'), async (pin) => {
    $('#recover-error').textContent = 'Checking…';
    try {
      const r = await recoverPair(S.uid, S.pending.code, pin, S.pending.name);
      S.line = { pairId: r.pairId, slot: r.slot, code: S.pending.code, name: S.pending.name };
      await Native.save('pl-line', S.line);
      await saveLock(pin);
      S.pending = null;
      S.unlocked = true;
      toast('This phone now replaces your old one.');
      enterLine();
    } catch (ex) {
      $('#recover-error').textContent = ex.message;
      shake($('#recover-dots'));
    }
  });
  show('recover');
}

async function finishActivation(pin) {
  const p = S.pending;
  $('#pin-setup-error').textContent = 'Activating…';
  try {
    let r;
    if (p.mode === 'create') r = await createPair(S.uid, p.code, p.name, pin);
    else if (p.mode === 'join') r = await joinPair(S.uid, p.code, p.name, pin);
    else r = { pairId: S.line.pairId, slot: S.line.slot };
    S.line = { pairId: r.pairId, slot: r.slot, code: p.code, name: p.name };
    await Native.save('pl-line', S.line);
    await saveLock(pin);
    if (p.mode === 'existing') {
      // Re-protect the existing place with the newly chosen PIN.
      const snapSlot = { uid: S.uid, name: p.name, recovery: await recoveryHash(p.code, r.slot, pin), joinedAt: Date.now() };
      await updateOwnSlot(r.pairId, r.slot, snapSlot, {});
    }
    S.pending = null;
    S.unlocked = true;
    $('#pin-setup-error').textContent = '';
    enterLine();
  } catch (ex) {
    $('#pin-setup-error').textContent = ex.message;
    if (ex instanceof PairError && ex.code === 'full') setTimeout(() => show('join'), 1800);
  }
}

/* ---------------- Lock ---------------- */
let lockAttempts = 0;
let lockedUntil = 0;

function lockApp() {
  S.unlocked = false;
  $('#lock-error').textContent = '';
  pinEntry('lock', $('#lock-dots'), async (pin) => {
    if (Date.now() < lockedUntil) {
      $('#lock-error').textContent = `Too many tries. Wait ${Math.ceil((lockedUntil - Date.now()) / 1000)} s.`;
      return;
    }
    if (await pinHash(pin, S.lock.salt) === S.lock.hash) {
      lockAttempts = 0;
      unlock();
    } else {
      lockAttempts++;
      shake($('#lock-dots'));
      if (lockAttempts >= 5) {
        lockedUntil = Date.now() + 30000 * Math.pow(2, Math.min(4, lockAttempts - 5));
        $('#lock-error').textContent = 'Too many wrong PINs. Wait a moment and try again.';
      } else {
        $('#lock-error').textContent = 'Wrong PIN.';
      }
    }
  });
  const bio = S.lock && S.lock.bio;
  $('#bio-btn').hidden = !bio;
  show('lock');
  if (bio) setTimeout(tryBiometric, 300);
}

async function tryBiometric() {
  if (await Native.biometricVerify()) unlock();
}

function unlock() {
  S.unlocked = true;
  enterLine();
}

/* ---------------- Inside the line ---------------- */
function stopWatchers() {
  S.unsubs.forEach((u) => u());
  S.unsubs = [];
}

function enterLine() {
  stopWatchers();
  S.unsubs.push(watchPair(S.line.pairId, onPair, (e) => {
    if (e.code === 'permission-denied') removedFromLine();
  }));
  S.unsubs.push(Chat.watchMessages(S.line.pairId, onMessages, () => {}));
  S.unsubs.push(watchIncomingCalls(S.line.pairId, S.uid, onIncomingCall));
  heartbeat();
  Native.setupPush(
    (token) => Chat.updateDevice(S.line.pairId, S.uid, { token, platform: 'android' }),
    (data) => { if (data && data.type === 'message' && S.unlocked) show('chat'); },
  ).then((st) => { S.push = st; renderSettings(); });
  Native.clearNotifications();
  show(S.pair && S.pair.slots.b ? 'chat' : S.pair ? 'waiting' : 'chat');
}

function onPair(pair) {
  if (!pair) return;
  S.pair = pair;
  const mine = mySlot();
  if (!mine || mine.uid !== S.uid) { removedFromLine(); return; }
  const peer = peerSlot();
  if (!peer) {
    $('#wait-code').textContent = S.line.code;
    if (S.screen !== 'settings') show('waiting');
    return;
  }
  if (S.peerUnsub && S.peerUid !== peer.uid) { S.peerUnsub(); S.peerUnsub = null; }
  if (!S.peerUnsub) {
    S.peerUid = peer.uid;
    S.peerUnsub = Chat.watchDevice(S.line.pairId, peer.uid, (d) => { S.peerDevice = d; renderPeer(); });
    S.unsubs.push(() => { if (S.peerUnsub) S.peerUnsub(); S.peerUnsub = null; });
  }
  renderPeer();
  if (S.screen === 'waiting') { show('chat'); toast(`${peer.name} joined. You can now talk privately.`); }
}

async function removedFromLine() {
  stopWatchers();
  await Native.remove('pl-line');
  S.line = null;
  S.pair = null;
  show('welcome');
  const w = $('#config-warning');
  w.hidden = false;
  w.textContent = 'This phone is no longer on the line (another phone was activated in its place).';
}

function renderPeer() {
  const peer = peerSlot();
  if (!peer) return;
  $('#peer-name').textContent = peer.name;
  $('#peer-avatar').textContent = initial(peer.name);
  const d = S.peerDevice || {};
  let status = '';
  if (d.typingUntil && d.typingUntil > Date.now()) status = '<span class="typing">typing…</span>';
  else if (d.lastActive && Date.now() - d.lastActive < 70000) status = 'online';
  else if (d.lastActive) status = `last seen ${dayLabel(d.lastActive).toLowerCase()} at ${fmtTime(d.lastActive)}`;
  $('#peer-status').innerHTML = status;
}

function heartbeat() {
  clearInterval(S.heartbeatTimer);
  const beat = () => { if (S.line && S.active && S.unlocked) Chat.updateDevice(S.line.pairId, S.uid, { lastActive: Date.now(), name: S.line.name }); };
  beat();
  S.heartbeatTimer = setInterval(() => { beat(); renderPeer(); }, 30000);
}

/* ---------------- Messages ---------------- */
const rendered = new Map(); // id -> { sig, el }

function onMessages(list) {
  S.messages = list;
  renderMessages();
  // Delivered as soon as this phone has them; read when the chat is on screen.
  Chat.acknowledge(S.line.pairId, S.uid, list, chatVisible());
}

const chatVisible = () => S.screen === 'chat' && S.unlocked && S.active;

function markRead() {
  if (S.line && chatVisible()) Chat.acknowledge(S.line.pairId, S.uid, S.messages, true);
}

function tick(m) {
  if (m.from !== S.uid) return '';
  if (m.pending) return '<span class="tick" title="Waiting to send">🕓</span>';
  if (m.readAt) return '<span class="tick read" title="Read">✓✓</span>';
  if (m.deliveredAt) return '<span class="tick" title="Delivered">✓✓</span>';
  return '<span class="tick" title="Sent">✓</span>';
}

function messageHtml(m) {
  const mine = m.from === S.uid;
  if (m.type === 'call') return `<div class="text">${esc(m.text)}</div><div class="meta">${fmtTime(m.at)}</div>`;
  let body = '';
  if (m.replyTo) body += `<div class="quote">${esc(m.replyTo.text || '')}</div>`;
  if (m.deleted) body += `<div class="text">${mine ? 'You deleted this message' : 'This message was deleted'}</div>`;
  else if (m.type === 'text') body += `<div class="text">${linkify(esc(m.text))}</div>`;
  else if (m.type === 'image') body += `<img class="photo" data-path="${esc(m.media.path)}" alt="Photo" ${m.media.width ? `width="${m.media.width}" height="${m.media.height}"` : ''}>`;
  else if (m.type === 'audio') body += `<audio controls preload="none" data-path="${esc(m.media.path)}"></audio><div class="muted small">🎤 ${fmtDur(m.media.duration || 0)}</div>`;
  else if (m.type === 'file') body += `<a class="file" href="#" data-open="${esc(m.media.path)}">📎 ${esc(m.media.name)} <span class="muted small">${Math.max(1, Math.round(m.media.size / 1024))} KB</span></a>`;
  body += `<div class="meta">${fmtTime(m.at)} ${tick(m)}</div>`;
  return body;
}

function linkify(html) {
  return html.replace(/\bhttps?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}

function renderMessages() {
  const box = $('#messages');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const frag = [];
  let lastDay = '';
  const seen = new Set();
  for (const m of S.messages) {
    const day = dayLabel(m.at);
    if (day !== lastDay) {
      lastDay = day;
      const key = `day-${day}`;
      let r = rendered.get(key);
      if (!r) { const el = document.createElement('div'); el.className = 'day'; el.textContent = day; r = { el, sig: day }; rendered.set(key, r); }
      seen.add(key);
      frag.push(r.el);
    }
    const sig = JSON.stringify([m.text, m.deleted, m.pending, !!m.deliveredAt, !!m.readAt, m.media && m.media.path, Math.round(m.at / 60000)]);
    let r = rendered.get(m.id);
    if (!r || r.sig !== sig) {
      const el = r ? r.el : document.createElement('div');
      el.className = `msg ${m.from === S.uid ? 'mine' : ''} ${m.type === 'call' ? 'call' : ''} ${m.deleted ? 'deleted' : ''}`;
      el.dataset.id = m.id;
      // Keep an audio element that is playing; only update its ticks.
      const playing = el.querySelector('audio') && !el.querySelector('audio').paused;
      if (playing) {
        const meta = el.querySelector('.meta');
        if (meta) meta.innerHTML = `${fmtTime(m.at)} ${tick(m)}`;
      } else {
        el.innerHTML = messageHtml(m);
        loadMedia(el);
      }
      r = { el, sig };
      rendered.set(m.id, r);
    }
    seen.add(m.id);
    frag.push(r.el);
  }
  for (const u of S.uploads) {
    const key = `up-${u.id}`;
    let r = rendered.get(key);
    if (!r) { const el = document.createElement('div'); el.className = 'msg mine'; r = { el }; rendered.set(key, r); }
    r.el.innerHTML = u.error
      ? `<div class="text">⚠ ${esc(u.label)} not sent: ${esc(u.error)}</div><div class="meta"><a href="#" data-retry="${u.id}">Retry</a> · <a href="#" data-drop="${u.id}">Remove</a></div>`
      : `<div class="text">${esc(u.label)}</div><div class="progress"><div></div></div>`;
    const bar = r.el.querySelector('.progress div');
    if (bar) bar.style.width = `${Math.round(u.progress * 100)}%`;
    seen.add(key);
    frag.push(r.el);
  }
  for (const k of [...rendered.keys()]) if (!seen.has(k)) { rendered.get(k).el.remove(); rendered.delete(k); }
  frag.forEach((el, i) => { if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null); });
  if (nearBottom || S.scrollToEnd) { box.scrollTop = box.scrollHeight; S.scrollToEnd = false; }
}

function loadMedia(el) {
  for (const node of el.querySelectorAll('[data-path]')) {
    Chat.mediaUrl(node.dataset.path).then((url) => { node.src = url; }).catch(() => {
      node.replaceWith(Object.assign(document.createElement('div'), { className: 'muted small', textContent: '⚠ Could not load (offline?)' }));
    });
  }
}

/* ---------------- Sending ---------------- */
function sendText() {
  const ta = $('#text');
  const text = ta.value.trim();
  if (!text || !S.line) return;
  const reply = S.replyTo ? { id: S.replyTo.id, text: S.replyTo.text.slice(0, 140) } : null;
  Chat.sendText(S.line.pairId, S.uid, text, reply);
  ta.value = '';
  setReply(null);
  composerState();
  S.scrollToEnd = true;
  lastTyping = 0; // the next keystroke should show "typing…" again straight away
  Chat.updateDevice(S.line.pairId, S.uid, { typingUntil: 0 });
}

function composerState() {
  const ta = $('#text');
  const has = ta.value.trim().length > 0;
  $('#send').hidden = !has;
  $('#mic').hidden = has;
  ta.style.height = 'auto';
  ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
}

let lastTyping = 0;
function typing() {
  composerState();
  if (S.line && Date.now() - lastTyping > 3000) {
    lastTyping = Date.now();
    Chat.updateDevice(S.line.pairId, S.uid, { typingUntil: Date.now() + 6000 });
  }
}

async function upload(blob, meta, label) {
  const u = { id: Math.random().toString(36).slice(2), label, progress: 0, blob, meta };
  S.uploads.push(u);
  S.scrollToEnd = true;
  renderMessages();
  try {
    await Chat.sendMedia(S.line.pairId, S.uid, blob, meta, (p) => { u.progress = p; renderMessages(); });
    S.uploads = S.uploads.filter((x) => x !== u);
    rendered.get(`up-${u.id}`)?.el.remove();
    rendered.delete(`up-${u.id}`);
  } catch (e) {
    u.error = navigator.onLine ? 'upload failed' : 'no connection';
  }
  renderMessages();
}

async function onFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 24 * 1024 * 1024) { toast('That file is too big (25 MB maximum).'); return; }
  if (file.type.startsWith('image/') && !/gif/.test(file.type)) {
    try {
      const img = await Chat.compressImage(file);
      upload(img.blob, { type: 'image', name: 'photo.jpg', mime: 'image/jpeg', width: img.width, height: img.height }, '📷 Sending photo…');
      return;
    } catch (_) { /* send as a file */ }
  }
  upload(file, { type: 'file', name: file.name, mime: file.type || 'application/octet-stream' }, `📎 Sending ${file.name}…`);
}

/* Voice notes */
const recorder = new VoiceRecorder();
async function startRecording() {
  try {
    await recorder.start();
  } catch (e) {
    toast('Allow the microphone to record voice messages.');
    return;
  }
  $('#composer').hidden = true;
  $('#recorder').hidden = false;
  clearInterval(S.recTimer);
  S.recTimer = setInterval(() => {
    $('#rec-time').textContent = fmtDur(recorder.elapsed());
    if (recorder.elapsed() > 15 * 60) stopRecording(false);
  }, 250);
}

async function stopRecording(cancel) {
  clearInterval(S.recTimer);
  const r = await recorder.stop(cancel);
  $('#recorder').hidden = true;
  $('#composer').hidden = false;
  $('#rec-time').textContent = '0:00';
  if (!r || r.duration < 0.5) return;
  const ext = r.mime.includes('mp4') ? 'm4a' : r.mime.includes('ogg') ? 'ogg' : 'webm';
  upload(r.blob, { type: 'audio', name: `voice.${ext}`, mime: r.mime, duration: r.duration }, '🎤 Sending voice message…');
}

/* Message actions */
let sheetMsg = null;
function openSheet(id) {
  const m = S.messages.find((x) => x.id === id);
  if (!m || m.type === 'call' || m.deleted) return;
  sheetMsg = m;
  $('[data-msg-act=delete]').hidden = m.from !== S.uid;
  $('[data-msg-act=copy]').hidden = m.type !== 'text';
  $('#sheet').hidden = false;
  Native.vibrate(20);
}

async function sheetAction(act) {
  $('#sheet').hidden = true;
  const m = sheetMsg;
  sheetMsg = null;
  if (!m) return;
  if (act === 'reply') setReply({ id: m.id, text: m.type === 'text' ? m.text : { image: '📷 Photo', audio: '🎤 Voice message', file: `📎 ${m.media && m.media.name}` }[m.type] });
  if (act === 'copy') { await navigator.clipboard.writeText(m.text).catch(() => {}); toast('Copied.'); }
  if (act === 'delete') await Chat.deleteForEveryone(S.line.pairId, m).catch(() => toast('Could not delete (offline?).'));
}

function setReply(r) {
  S.replyTo = r;
  const box = $('#reply-preview');
  box.hidden = !r;
  if (r) {
    box.innerHTML = `<span>↩ ${esc(r.text)}</span><button class="icon-btn" id="reply-cancel" aria-label="Cancel reply">✕</button>`;
    $('#reply-cancel').onclick = () => setReply(null);
    $('#text').focus();
  }
}

/* ---------------- Calls ---------------- */
async function startCall(kind) {
  const peer = peerSlot();
  if (!peer || S.call) return;
  if (!navigator.onLine) { toast('You are offline. Calls need an internet connection.'); return; }
  const call = new Call({
    pairId: S.line.pairId, uid: S.uid, otherUid: peer.uid, kind, incoming: false, onUpdate: onCallUpdate,
    ice: Backend.TEST ? [] : undefined,
  });
  S.call = call;
  showCall(call, peer.name);
  Native.startRingtone(true);
  try {
    await call.start();
  } catch (e) {
    Native.stopRingtone();
    toast(e && e.name === 'NotAllowedError' ? 'Allow the microphone (and camera) for calls.' : `Call failed: ${e.message}`);
    endCallUi();
  }
}

function onIncomingCall(c) {
  if (!S.line) return;
  if (S.call) { markBusy(S.line.pairId, c.id); return; }
  const peer = peerSlot();
  const call = new Call({
    pairId: S.line.pairId, uid: S.uid, otherUid: c.from, kind: c.kind, id: c.id, incoming: true, offer: c.offer,
    onUpdate: onCallUpdate, ice: Backend.TEST ? [] : undefined,
  });
  S.call = call;
  call.watchIncoming();
  showCall(call, peer ? peer.name : 'Private Line');
  Native.startRingtone(false);
}

function showCall(call, name) {
  const scr = $('#s-call');
  scr.classList.toggle('video', call.kind === 'video');
  scr.classList.remove('connected');
  $('#call-name').textContent = name;
  $('#call-avatar').textContent = initial(name);
  $('#call-incoming').hidden = !call.incoming;
  $('#call-controls').hidden = call.incoming;
  $('#call-cam').hidden = call.kind !== 'video';
  $('#call-flip').hidden = call.kind !== 'video';
  S.callReturn = S.unlocked ? 'chat' : 'lock';
  onCallUpdate(call);
  show('call');
}

const CALL_TEXT = {
  calling: 'Calling…',
  ringing: 'Incoming call…',
  connecting: 'Connecting…',
  declined: 'Call declined',
  busy: 'Line busy',
  missed: 'No answer',
  ended: 'Call ended',
  failed: 'Call failed — poor connection',
};

function onCallUpdate(call, extra) {
  if (call !== S.call) return;
  const scr = $('#s-call');
  if (call.status === 'ringing' && call.incoming) {
    $('#call-status').textContent = call.kind === 'video' ? 'Incoming video call…' : 'Incoming voice call…';
  } else if (call.status === 'connected') {
    Native.stopRingtone();
    scr.classList.add('connected');
    clearInterval(S.callTimer);
    const upd = () => { $('#call-status').textContent = fmtDur((Date.now() - call.connectedAt) / 1000); };
    upd();
    S.callTimer = setInterval(upd, 1000);
  } else {
    $('#call-status').textContent = CALL_TEXT[call.status] || '';
  }
  if (extra && extra.remote) {
    if (call.kind === 'video') $('#remote-video').srcObject = extra.remote;
    $('#remote-audio').srcObject = call.kind === 'video' ? null : extra.remote;
  }
  if (call.local && $('#local-video').srcObject !== call.local) $('#local-video').srcObject = call.local;
  scr.classList.toggle('has-local', !!call.local && !call.finished);
  $('#call-mute').classList.toggle('off', call.muted);
  $('#call-cam').classList.toggle('off', call.cameraOff);
  if (call.finished) {
    Native.stopRingtone();
    clearInterval(S.callTimer);
    if (!call.incoming) recordCall(call);
    setTimeout(endCallUi, 1500);
  }
}

function recordCall(call) {
  const kind = call.kind === 'video' ? 'video call' : 'voice call';
  let text;
  if (call.duration) text = `📞 ${kind[0].toUpperCase()}${kind.slice(1)} · ${fmtDur(call.duration)}`;
  else if (call.status === 'declined') text = `📞 ${kind[0].toUpperCase()}${kind.slice(1)} declined`;
  else if (call.status === 'busy') text = '📞 Line busy';
  else text = `📞 Missed ${kind}`;
  Chat.sendCallRecord(S.line.pairId, S.uid, text);
}

function endCallUi() {
  for (const v of ['#remote-video', '#local-video', '#remote-audio']) $(v).srcObject = null;
  S.call = null;
  show(S.callReturn === 'lock' && !S.unlocked ? 'lock' : 'chat');
}

/* ---------------- Settings ---------------- */
function renderSettings() {
  if (!S.line) return;
  $('#set-name').value = S.line.name;
  $('#set-bio').checked = !!(S.lock && S.lock.bio);
  $('#set-lock-after').value = String(S.lock ? S.lock.lockAfter : 60);
  $('#settings-code').hidden = true;
  $('#about').textContent = `Private Line ${VERSION}. Messages are stored in your private Firebase project and readable only by the two phones on this line.`;
  $('#push-status').textContent = {
    granted: '🔔 Notifications on: messages and calls arrive even when the app is closed.',
    denied: '🔕 Notifications are off. Turn them on in Android Settings → Apps → Private Line → Notifications.',
    unavailable: '🔕 Notifications while closed are not set up in this build (see the README: “Push notifications”).',
  }[S.push] || '';
  Native.biometricAvailable().then((ok) => { $('#set-bio-row').hidden = !ok; });
}

function verifyPinThen(fn) {
  // Reuse the lock screen to confirm the current PIN before sensitive actions.
  const back = S.screen;
  $('#lock-error').textContent = 'Enter your current PIN';
  $('#bio-btn').hidden = true;
  pinEntry('lock', $('#lock-dots'), async (pin) => {
    if (await pinHash(pin, S.lock.salt) === S.lock.hash) fn(pin);
    else { shake($('#lock-dots')); $('#lock-error').textContent = 'Wrong PIN.'; }
  });
  show('lock');
  S.cancelVerify = () => show(back);
}

function bindSettings() {
  $('#save-name').onclick = async () => {
    const name = $('#set-name').value.trim();
    if (!name) return;
    try {
      await updateOwnSlot(S.line.pairId, S.line.slot, mySlot(), { name });
      S.line.name = name;
      await Native.save('pl-line', S.line);
      toast('Name saved.');
    } catch (_) { toast('Could not save (offline?).'); }
  };
  $('#change-pin').onclick = () => verifyPinThen(() => setupPin({
    title: 'Choose a new PIN',
    help: 'Your new PIN also becomes the PIN for moving to a new phone.',
    onBack: () => show('settings'),
    onDone: async (pin) => {
      try {
        await updateOwnSlot(S.line.pairId, S.line.slot, mySlot(), { recovery: await recoveryHash(S.line.code, S.line.slot, pin) });
        await saveLock(pin);
        toast('PIN changed.');
        show('settings');
      } catch (_) {
        $('#pin-setup-error').textContent = 'Could not change the PIN (needs a connection).';
      }
    },
  }));
  $('#set-bio').onchange = async (e) => {
    if (e.target.checked && !(await Native.biometricVerify())) { e.target.checked = false; return; }
    S.lock.bio = e.target.checked;
    await Native.save('pl-lock', S.lock);
  };
  $('#set-lock-after').onchange = async (e) => {
    S.lock.lockAfter = Number(e.target.value);
    await Native.save('pl-lock', S.lock);
  };
  $('#show-code').onclick = () => verifyPinThen(() => {
    show('settings');
    $('#settings-code').textContent = S.line.code;
    $('#settings-code').hidden = false;
  });
  $('#deactivate').onclick = async () => {
    if (!window.confirm('Remove Private Line from this phone? Messages stay on the line. To use it again (here or on another phone) you need the pair code and your PIN.')) return;
    stopWatchers();
    await Native.remove('pl-line');
    await Native.remove('pl-lock');
    await Backend.auth.signOut().catch(() => {});
    location.reload();
  };
}

/* ---------------- Wiring ---------------- */
function bind() {
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); show(go.dataset.go); if (go.dataset.go === 'settings') renderSettings(); return; }
    const img = e.target.closest('img.photo');
    if (img && img.src) { $('#viewer-img').src = img.src; $('#viewer').hidden = false; return; }
    const open = e.target.closest('[data-open]');
    if (open) { e.preventDefault(); Chat.mediaUrl(open.dataset.open).then((u) => window.open(u, '_blank')); return; }
    const retry = e.target.closest('[data-retry]');
    if (retry) {
      e.preventDefault();
      const u = S.uploads.find((x) => x.id === retry.dataset.retry);
      if (u) { S.uploads = S.uploads.filter((x) => x !== u); rendered.get(`up-${u.id}`)?.el.remove(); rendered.delete(`up-${u.id}`); upload(u.blob, u.meta, u.label); }
      return;
    }
    const drop = e.target.closest('[data-drop]');
    if (drop) { e.preventDefault(); S.uploads = S.uploads.filter((x) => x.id !== drop.dataset.drop); renderMessages(); return; }
    const act = e.target.closest('[data-msg-act]');
    if (act) { sheetAction(act.dataset.msgAct); return; }
    if (e.target.id === 'sheet') $('#sheet').hidden = true;
  });
  $('#viewer-close').onclick = () => { $('#viewer').hidden = true; };
  $('#viewer').onclick = (e) => { if (e.target.id === 'viewer') $('#viewer').hidden = true; };

  $('#create-form').addEventListener('submit', startCreate);
  $('#join-form').addEventListener('submit', startJoin);
  $('#join-code').addEventListener('input', (e) => { e.target.value = formatCodeInput(e.target.value); });
  $('#copy-code').onclick = () => navigator.clipboard.writeText(S.line.code).then(() => toast('Code copied.')).catch(() => {});
  $('#share-code').onclick = () => {
    const text = `Install Private Line and activate it with this code: ${S.line.code}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => toast('Copied. Paste it into a message.'));
  };
  $('#bio-btn').onclick = tryBiometric;

  $('#text').addEventListener('input', typing);
  $('#text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !Native.NATIVE) { e.preventDefault(); sendText(); } });
  $('#send').onclick = sendText;
  $('#file-input').addEventListener('change', onFile);
  $('#mic').onclick = startRecording;
  $('#rec-cancel').onclick = () => stopRecording(true);
  $('#rec-send').onclick = () => stopRecording(false);

  // Long-press (or right-click) a message for reply / copy / delete.
  let pressTimer = null;
  $('#messages').addEventListener('pointerdown', (e) => {
    const m = e.target.closest('.msg[data-id]');
    if (!m || e.target.closest('audio,a')) return;
    pressTimer = setTimeout(() => openSheet(m.dataset.id), 500);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'scroll']) $('#messages').addEventListener(ev, () => clearTimeout(pressTimer), true);
  $('#messages').addEventListener('contextmenu', (e) => {
    const m = e.target.closest('.msg[data-id]');
    if (m) { e.preventDefault(); openSheet(m.dataset.id); }
  });

  $('#call-audio').onclick = () => startCall('audio');
  $('#call-video').onclick = () => startCall('video');
  $('#call-accept').onclick = async () => {
    const call = S.call;
    if (!call) return;
    Native.stopRingtone();
    $('#call-incoming').hidden = true;
    $('#call-controls').hidden = false;
    try { await call.accept(); } catch (e) {
      toast(e && e.name === 'NotAllowedError' ? 'Allow the microphone (and camera) for calls.' : `Call failed: ${e.message}`);
      call.hangup('failed');
    }
  };
  $('#call-decline').onclick = () => { Native.stopRingtone(); if (S.call) S.call.decline(); };
  $('#call-end').onclick = () => { if (S.call) S.call.hangup(); };
  $('#call-mute').onclick = () => S.call && S.call.toggleMute();
  $('#call-cam').onclick = () => S.call && S.call.toggleCamera();
  $('#call-flip').onclick = () => S.call && S.call.flipCamera().catch(() => {});

  bindSettings();

  const online = () => { $('#offline-banner').hidden = navigator.onLine; };
  window.addEventListener('online', online);
  window.addEventListener('offline', online);
  online();

  Native.onAppState((active) => {
    S.active = active;
    if (!active) { S.hiddenAt = Date.now(); return; }
    Native.clearNotifications();
    if (S.line && S.lock && S.unlocked && !S.call && Date.now() - S.hiddenAt >= S.lock.lockAfter * 1000) lockApp();
    else { heartbeat(); markRead(); }
  });
  Native.onBackButton(() => {
    if (!$('#viewer').hidden) { $('#viewer').hidden = true; return; }
    if (!$('#sheet').hidden) { $('#sheet').hidden = true; return; }
    if (S.screen === 'lock' && S.cancelVerify && S.unlocked) { S.cancelVerify(); S.cancelVerify = null; return; }
    if (S.screen === 'settings') { show('chat'); return; }
    if (['join', 'create'].includes(S.screen)) { show('welcome'); return; }
    Native.exitApp();
  });
  for (const k of ['setup', 'lock', 'recover']) keypad($(`[data-keypad=${k}]`), () => {});
}

async function main() {
  bind();
  if (!Backend.init()) {
    show('welcome');
    const w = $('#config-warning');
    w.hidden = false;
    w.textContent = 'This build is not connected to a Firebase project yet. See the README, “Set up the server”.';
    $$('#s-welcome .btn').forEach((b) => { b.disabled = true; });
    return;
  }
  S.line = await Native.load('pl-line');
  S.lock = await Native.load('pl-lock');
  try {
    S.uid = (await Backend.signedInUser()).uid;
  } catch (e) {
    show('welcome');
    const w = $('#config-warning');
    w.hidden = false;
    w.textContent = 'No internet connection. Connect once to activate Private Line.';
    window.addEventListener('online', () => location.reload(), { once: true });
    return;
  }
  if (S.line && S.lock) lockApp();
  else show('welcome');
  document.body.dataset.ready = '1';
}

main();
