const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, shell, powerMonitor, nativeImage, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { Store } = require('./store');
const Scheduler = require('./scheduler');
const Model = require('./model');
const TZ = require('../shared/tz');

const APP_ID = 'com.executiveassistantdesk.app';
const IS_TEST = process.env.EAD_TEST === '1';
const TICK_MS = 5000;

if (process.env.EAD_USER_DATA) app.setPath('userData', process.env.EAD_USER_DATA);
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

const store = new Store(app.getPath('userData'));
let win = null;
let attentionWin = null;
let tray = null;
let quitting = false;
let clockOffset = 0; // only changed by the automated tests
const now = () => Date.now() + clockOffset;
const launchedHidden = process.argv.includes('--hidden');

const assetPath = (...p) => path.join(__dirname, '..', '..', 'assets', ...p);

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Executive Assistant Desk',
    icon: assetPath('icon.png'),
    show: false,
    backgroundColor: '#f4f6fa',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false, // keep the clocks and spoken reminders running while hidden
      autoplayPolicy: 'no-user-gesture-required', // the alarm must sound without a click
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    const hidden = (launchedHidden && store.data.settings.startHidden) || process.env.EAD_START_HIDDEN === '1';
    if (!hidden) win.show();
  });
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!store.data.settings.trayHintShown) {
      store.data.settings.trayHintShown = true;
      store.save();
      notify('Still running in the system tray', 'Executive Assistant Desk keeps announcing reminders. Right-click the tray icon and choose Quit to exit.');
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openLink(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

/* ---------- Attention mode: flashing always-on-top alert window ---------- */
function createAttentionWindow() {
  attentionWin = new BrowserWindow({
    width: 560,
    height: 340,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    show: false,
    title: 'Reminder — Executive Assistant Desk',
    icon: assetPath('icon.png'),
    backgroundColor: '#7a0d0d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  attentionWin.setAlwaysOnTop(true, 'screen-saver');
  attentionWin.setVisibleOnAllWorkspaces(true);
  attentionWin.removeMenu();
  attentionWin.loadFile(path.join(__dirname, '..', 'renderer', 'attention.html'));
  attentionWin.on('close', (e) => {
    if (quitting) return;
    // Closing the alert counts as acknowledging it.
    e.preventDefault();
    silence(null);
    Scheduler.acknowledge(store.data, null);
    store.save();
    broadcast();
  });
}

/** Stop a playing or queued alarm for an alert that was just acknowledged (null = all). */
function silence(instance) {
  if (win && !win.isDestroyed()) win.webContents.send('silence', instance);
}

function needsAttention() {
  return store.data.reminders.active.some((x) => x.needsAck);
}

function showAttention(alert) {
  if (!attentionWin || attentionWin.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea;
  const [w] = attentionWin.getSize();
  attentionWin.setPosition(Math.round(area.x + (area.width - w) / 2), area.y + 24);
  // showInactive: appear on top without taking the keyboard, so typing can't acknowledge it by accident.
  if (!attentionWin.isVisible()) attentionWin.showInactive();
  attentionWin.moveTop();
  attentionWin.webContents.send('attention-alert', alert);
  if (win && !win.isDestroyed()) win.flashFrame(true); // flash the taskbar button too
}

function syncAttention() {
  if (needsAttention()) return;
  if (attentionWin && !attentionWin.isDestroyed() && attentionWin.isVisible()) attentionWin.hide();
  if (win && !win.isDestroyed()) win.flashFrame(false);
}

/* ---------- Optional external vibration via push (phone / smartwatch) ---------- */
function webhookUrlValid(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (_) { return false; }
}

async function sendWebhook(alert, settings) {
  const s = settings || store.data.settings;
  if (!webhookUrlValid(s.webhookUrl)) throw new Error('Enter a valid web address starting with https://');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    let res;
    if (s.webhookType === 'json') {
      res = await fetch(s.webhookUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: 'Executive Assistant Desk', event: alert.reason === 'repeat' ? 'reminder-repeat' : 'reminder',
          kind: alert.kind, title: alert.title, message: alert.text,
          startsAt: new Date(alert.startUtc).toISOString(), vibrate: true,
        }),
      });
    } else {
      // ntfy (https://ntfy.sh or a self-hosted server): priority 5 = urgent, long vibration on phones/watches.
      res = await fetch(s.webhookUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: { Title: 'Executive Assistant Desk', Priority: '5', Tags: 'rotating_light' },
        body: alert.text,
      });
    }
    if (!res.ok) throw new Error(`The service answered ${res.status} ${res.statusText}`);
    return res.status;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('No answer from the service within 8 seconds.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function showWindow(focusTarget) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (focusTarget) win.webContents.send('focus', focusTarget);
}

function openLink(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') shell.openExternal(u.toString());
  } catch (_) { /* ignore invalid links */ }
}

function notify(title, body, onClick, persistent) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title, body, icon: assetPath('icon.png'), silent: true,
    timeoutType: persistent ? 'never' : 'default', // attention alerts stay on screen until clicked
    urgency: persistent ? 'critical' : 'normal',
  });
  n.on('click', () => (onClick ? onClick() : showWindow()));
  n.show();
}

function snapshot() {
  const d = store.data;
  return {
    meetings: d.meetings,
    tasks: d.tasks,
    settings: d.settings,
    reminders: { active: d.reminders.active, missed: d.reminders.missed },
    upcoming: Scheduler.upcoming(d, now()),
    clockOffset,
    isPackaged: app.isPackaged,
    version: app.getVersion(),
  };
}

function broadcast() {
  const snap = snapshot();
  if (win && !win.isDestroyed()) win.webContents.send('state', snap);
  if (attentionWin && !attentionWin.isDestroyed()) attentionWin.webContents.send('state', snap);
  syncAttention();
  updateTrayMenu();
}

function describeAnnouncement(a) {
  if (a.kind === 'test') return { title: 'Test attention alert', body: a.text };
  if (a.kind === 'task') {
    return { title: a.offset ? `Task due in ${a.offset} minutes` : 'Task due now', body: a.title };
  }
  const zone = a.timeZone || 'Africa/Lagos';
  const times = TZ.equivalents(a.startUtc, zone).map((e) => `${e.short} ${e.time12}${e.dayShift ? ` (${e.dateShort})` : ''}`).join(' · ');
  const mins = Math.max(0, Math.round((a.startUtc - now()) / Scheduler.MINUTE));
  return { title: mins > 0 ? `Meeting in ${mins} minutes` : 'Meeting starting now', body: `${a.title}\n${times}` };
}

function dispatch(announcements) {
  const s = store.data.settings;
  for (const a of announcements) {
    if (win && !win.isDestroyed()) win.webContents.send('announce', a);
    if (a.attention) {
      showAttention(a);
      if (s.webhookEnabled && s.webhookUrl) sendWebhook(a).catch((e) => console.error('Vibration push failed:', e.message));
    }
    // Repeats re-use the on-screen alert instead of stacking more Windows notifications.
    if (s.notifications && a.reason !== 'repeat') {
      const { title, body } = describeAnnouncement(a);
      notify(a.attention ? '⚠ ' + title : title, body, () => showWindow('alerts'), a.attention);
    }
  }
}

function tick() {
  const result = Scheduler.evaluate(store.data, now());
  if (result.changed) store.save();
  dispatch(result.announce);
  if (result.missed.length && store.data.settings.notifications) {
    const titles = [...new Set(result.missed.map((m) => m.title))];
    notify(
      `${result.missed.length} reminder${result.missed.length > 1 ? 's' : ''} missed`,
      `While the computer was asleep or the app was closed: ${titles.slice(0, 3).join(', ')}${titles.length > 3 ? '…' : ''}`,
      () => showWindow('alerts'),
    );
  }
  if (result.changed || result.announce.length || result.missed.length) broadcast();
}

function applyLoginItem() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  app.setLoginItemSettings({ openAtLogin: !!store.data.settings.openAtLogin, args: ['--hidden'] });
}

function updateTrayMenu() {
  if (!tray) return;
  const s = store.data.settings;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Executive Assistant Desk', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Add meeting…', click: () => showWindow('add-meeting') },
    { label: 'Add task…', click: () => showWindow('add-task') },
    { type: 'separator' },
    { label: 'Mute spoken reminders', type: 'checkbox', checked: !!s.muted, click: (i) => updateSettings({ muted: i.checked }) },
    { label: 'Start when I sign in to Windows', type: 'checkbox', checked: !!s.openAtLogin, click: (i) => updateSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const img = nativeImage.createFromPath(assetPath('tray.png'));
  tray = new Tray(img);
  tray.setToolTip('Executive Assistant Desk');
  tray.on('click', () => (win && win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  updateTrayMenu();
}

const SETTING_KEYS = {
  voiceName: 'string', volume: 'number', rate: 'number', muted: 'boolean', speechEngine: 'string',
  notifications: 'boolean', openAtLogin: 'boolean', startHidden: 'boolean', snoozeMinutes: 'number',
  attentionEnabled: 'boolean', attentionTasks: 'boolean', alarmSound: 'string', alarmVolume: 'number',
  alarmSeconds: 'number', repeatSeconds: 'number', flashing: 'boolean', vibrateGamepad: 'boolean',
  webhookEnabled: 'boolean', webhookType: 'string', webhookUrl: 'string',
};

function updateSettings(patch) {
  const s = store.data.settings;
  for (const [k, v] of Object.entries(patch || {})) {
    if (SETTING_KEYS[k] && typeof v === SETTING_KEYS[k]) s[k] = v;
  }
  s.volume = Math.min(1, Math.max(0, s.volume));
  s.rate = Math.min(2, Math.max(0.5, s.rate));
  s.snoozeMinutes = [1, 2, 5, 10, 15].includes(s.snoozeMinutes) ? s.snoozeMinutes : 5;
  if (!['browser', 'windows'].includes(s.speechEngine)) s.speechEngine = 'browser';
  if (Array.isArray(patch && patch.attentionOffsets)) {
    s.attentionOffsets = Scheduler.MEETING_OFFSETS.filter((o) => patch.attentionOffsets.includes(o));
  }
  if (!['siren', 'beeps', 'bell'].includes(s.alarmSound)) s.alarmSound = 'siren';
  s.alarmVolume = Math.min(1, Math.max(0.05, s.alarmVolume));
  s.alarmSeconds = [2, 4, 6, 10].includes(s.alarmSeconds) ? s.alarmSeconds : 4;
  s.repeatSeconds = [30, 60, 120, 180, 300].includes(s.repeatSeconds) ? s.repeatSeconds : 60;
  if (!['ntfy', 'json'].includes(s.webhookType)) s.webhookType = 'ntfy';
  s.webhookUrl = s.webhookUrl.trim().slice(0, 1000);
  if (s.webhookEnabled && !webhookUrlValid(s.webhookUrl)) s.webhookEnabled = false;
  store.save();
  if ('openAtLogin' in (patch || {})) applyLoginItem();
  broadcast();
  return s;
}

/* ---------- Windows native speech (PowerShell System.Speech) ---------- */
const PS_SPEAK = [
  'Add-Type -AssemblyName System.Speech;',
  '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
  'if ($env:EAD_VOICE) { try { $s.SelectVoice($env:EAD_VOICE) } catch {} };',
  '$s.Volume = [int]$env:EAD_VOLUME; $s.Rate = [int]$env:EAD_RATE;',
  '$s.Speak($env:EAD_TEXT)',
].join(' ');
const PS_VOICES = 'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }';

function runPowerShell(script, env) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ ok: false, out: '' });
    let out = '';
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      env: { ...process.env, ...env }, windowsHide: true,
    });
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve({ ok: false, out }));
    p.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}

/* ---------- IPC ---------- */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

function mutate(fn) {
  const value = fn();
  store.save();
  tick();
  broadcast();
  return value;
}

function registerIpc() {
  handle('state:get', () => snapshot());
  handle('meeting:save', (input) => mutate(() => Model.saveMeeting(store.data, input, now())));
  handle('meeting:status', (id, status) => mutate(() => Model.setMeetingStatus(store.data, id, status === 'cancelled' ? 'cancelled' : 'scheduled', now())));
  handle('meeting:delete', (id) => mutate(() => Model.deleteMeeting(store.data, id)));
  handle('task:save', (input) => mutate(() => Model.saveTask(store.data, input, now())));
  handle('task:complete', (id, done) => mutate(() => Model.setTaskCompleted(store.data, id, done, now())));
  handle('task:delete', (id) => mutate(() => Model.deleteTask(store.data, id)));
  handle('settings:update', (patch) => updateSettings(patch));
  handle('reminder:snooze', (instance, minutes) => { silence(instance); return mutate(() => Scheduler.snooze(store.data, instance, Number(minutes) || store.data.settings.snoozeMinutes, now())); });
  handle('reminder:dismiss', (instance) => { silence(instance); return mutate(() => Scheduler.dismiss(store.data, instance, now())); });
  handle('reminder:acknowledge', (instance) => { silence(instance || null); return mutate(() => Scheduler.acknowledge(store.data, instance || null)); });
  handle('attention:test', () => {
    const a = Scheduler.startTestAlert(store.data, now());
    store.save();
    dispatch([a]);
    broadcast();
    return true;
  });
  handle('vibration:testWebhook', (draft) => sendWebhook(
    { kind: 'test', reason: 'test', title: 'Test', text: 'Test vibration from Executive Assistant Desk.', startUtc: now() },
    { ...store.data.settings, ...(draft || {}) },
  ));
  handle('app:showMain', (target) => showWindow(target));
  handle('missed:clear', (key) => mutate(() => {
    store.data.reminders.missed = key ? store.data.reminders.missed.filter((m) => m.instance !== key) : [];
  }));
  handle('link:open', (url) => openLink(url));
  handle('speech:native', async (text) => {
    const s = store.data.settings;
    const res = await runPowerShell(PS_SPEAK, {
      EAD_TEXT: String(text).slice(0, 500), EAD_VOICE: s.voiceName || '',
      EAD_VOLUME: String(Math.round(s.volume * 100)), EAD_RATE: String(Math.round(Math.max(-10, Math.min(10, (s.rate - 1) * 10)))),
    });
    return res.ok;
  });
  handle('speech:nativeVoices', async () => {
    const res = await runPowerShell(PS_VOICES, {});
    return res.out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  });
  handle('app:hide', () => win && win.hide());
  if (IS_TEST) {
    handle('test:setClockOffset', (ms) => { clockOffset = Number(ms) || 0; tick(); broadcast(); return clockOffset; });
    handle('test:tick', () => { tick(); return snapshot(); });
    handle('test:quit', () => { quitting = true; setTimeout(() => app.quit(), 50); });
  }
}

if (app.hasSingleInstanceLock()) {
  app.whenReady().then(() => {
    store.load();
    if (process.env.EAD_CLOCK_OFFSET_MS && IS_TEST) clockOffset = Number(process.env.EAD_CLOCK_OFFSET_MS) || 0;
    registerIpc();
    createWindow();
    createAttentionWindow();
    createTray();
    applyLoginItem();
    // First evaluation happens once the page can receive announcements.
    win.webContents.once('did-finish-load', () => {
      tick();
      setInterval(tick, TICK_MS);
    });
    for (const ev of ['resume', 'unlock-screen']) powerMonitor.on(ev, () => setTimeout(tick, 1500));
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', (e) => e.preventDefault()); // stay in the tray
}
