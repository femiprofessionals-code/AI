/*
 * Android side of Executive Assistant Desk.
 *
 * Provides the same `window.desk` interface the desktop app's preload script gives the
 * shared screens (src/renderer/app.js), but runs everything on the phone:
 *   - data kept on the phone (Capacitor Preferences), works fully offline
 *   - the same reminder engine (src/main/scheduler.js) while the app is open
 *   - every upcoming reminder pre-scheduled as an Android notification, so reminders
 *     arrive even when the app is closed or the phone is locked
 *   - spoken reminders with the phone's text-to-speech while the app is open
 *   - attention mode: alarm-sound notification channel, repeated notifications until
 *     acknowledged, full-screen flashing alert and vibration while the app is open
 *   - the same cloud sync as the desktop (src/shared/sync.js)
 */
const { Capacitor } = require('@capacitor/core');
const { LocalNotifications } = require('@capacitor/local-notifications');
const { Preferences } = require('@capacitor/preferences');
const { App } = require('@capacitor/app');
const { Haptics } = require('@capacitor/haptics');
const { TextToSpeech } = require('@capacitor-community/text-to-speech');
const TZ = require('../../src/shared/tz');
const Model = require('../../src/main/model');
const Scheduler = require('../../src/main/scheduler');
const { normalize, applySettings } = require('../../src/shared/data');
const { FirebaseClient, SyncEngine } = require('../../src/shared/sync');
const BUILD_SYNC_CONFIG = require('../../src/shared/sync-config.json');
const VERSION = require('../package.json').version;

const MINUTE = 60 * 1000;
const TICK_MS = 5000;
const SYNC_INTERVAL_MS = 60 * 1000;
const SYNC_INTERVAL_ALERT_MS = 15 * 1000;
const HORIZON_MS = 14 * 24 * 60 * MINUTE; // how far ahead notifications are scheduled
const MAX_NOTIFICATIONS = 300;
const MAX_REPEATS = 12; // pre-scheduled attention repeats per reminder while the app is closed

const params = new URLSearchParams(window.location.search);
const IS_TEST = params.has('test');
const NATIVE = Capacitor.isNativePlatform();
const KEYS = { data: 'ead-data', session: 'ead-session', notified: 'ead-notified' };

let data = normalize(null);
let session = null;
let notified = {}; // notifications handed to Android: key -> { at, instance, attention }
let clockOffset = 0;
let syncEngine = null;
let syncTimer = null;
let syncSoonTimer = null;
let rescheduleTimer = null;
let foreground = true;
const now = () => Date.now() + clockOffset;
const listeners = { state: [], announce: [], focus: [], silence: [], 'attention-alert': [] };
const scheduledLog = []; // last computed notification plan (inspected by automated tests)

function emit(channel, payload) {
  for (const cb of listeners[channel]) {
    try { cb(payload); } catch (e) { console.error(e); }
  }
}

function on(channel, cb) {
  listeners[channel].push(cb);
  return () => { listeners[channel] = listeners[channel].filter((x) => x !== cb); };
}

/* ---------------- Storage ---------------- */
let writeChain = Promise.resolve();
function save() {
  const json = JSON.stringify(data);
  writeChain = writeChain.then(() => Preferences.set({ key: KEYS.data, value: json })).catch((e) => console.error('save failed', e));
  return writeChain;
}

function saveNotified() {
  const json = JSON.stringify(notified);
  writeChain = writeChain.then(() => Preferences.set({ key: KEYS.notified, value: json })).catch(() => {});
  return writeChain;
}

async function readJson(key) {
  try {
    const { value } = await Preferences.get({ key });
    return value ? JSON.parse(value) : null;
  } catch (_) { return null; }
}

/* ---------------- Sync ---------------- */
function syncConfig() {
  const emu = params.get('emu');
  if (IS_TEST && emu) {
    const [auth, firestore] = emu.split(',');
    return { apiKey: 'emulator-key', projectId: params.get('project') || 'demo-ead', emulator: { auth, firestore } };
  }
  return {
    apiKey: BUILD_SYNC_CONFIG.apiKey || data.settings.syncApiKey,
    projectId: BUILD_SYNC_CONFIG.projectId || data.settings.syncProjectId,
  };
}

function createSyncEngine() {
  syncEngine = new SyncEngine({
    data: () => data,
    client: new FirebaseClient(syncConfig()),
    loadSession: () => session,
    saveSession: (s) => {
      session = s;
      writeChain = writeChain.then(() => (s ? Preferences.set({ key: KEYS.session, value: JSON.stringify(s) }) : Preferences.remove({ key: KEYS.session })));
    },
    persist: save,
    onRemoteChange: applyRemoteChanges,
  });
}

function applyRemoteChanges(changes) {
  for (const c of changes) {
    if (c.type !== 'alerts' || c.deleted) continue;
    if (c.record.action === 'dismiss') Scheduler.dismiss(data, c.id, now());
    else Scheduler.acknowledge(data, c.id);
    emit('silence', c.id);
  }
  tick();
  broadcast();
}

async function runSync() {
  if (!syncEngine) return;
  try { await syncEngine.sync(); } catch (_) { /* shown in Settings */ }
  broadcast();
  scheduleSync();
}

function scheduleSync() {
  clearTimeout(syncTimer);
  if (!foreground) return; // Android pauses the app in the background; sync resumes when it is opened
  const alerting = data.reminders.active.some((x) => x.needsAck);
  syncTimer = setTimeout(runSync, alerting ? SYNC_INTERVAL_ALERT_MS : SYNC_INTERVAL_MS);
}

function syncSoon() {
  clearTimeout(syncSoonTimer);
  syncSoonTimer = setTimeout(runSync, 1500);
}

function syncStatus() {
  return syncEngine ? syncEngine.status() : { configured: false, signedIn: false };
}

/* ---------------- State ---------------- */
function snapshot() {
  return {
    meetings: data.meetings,
    tasks: data.tasks,
    settings: data.settings,
    reminders: { active: data.reminders.active, missed: data.reminders.missed },
    upcoming: Scheduler.upcoming(data, now()),
    clockOffset,
    sync: { ...syncStatus(), buildConfigured: !!(BUILD_SYNC_CONFIG.apiKey && BUILD_SYNC_CONFIG.projectId) },
    platform: 'android',
    isPackaged: NATIVE,
    version: VERSION,
  };
}

function broadcast() {
  emit('state', snapshot());
  rescheduleSoon();
}

/* ---------------- Reminders while the app is open ---------------- */
async function vibratePattern() {
  if (!data.settings.phoneVibrate) return;
  for (let i = 0; i < 3; i++) {
    try { await Haptics.vibrate({ duration: 700 }); } catch (_) { /* no vibrator */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function dispatch(announcements) {
  for (const a of announcements) {
    emit('announce', a);
    if (a.attention) {
      emit('attention-alert', a);
      vibratePattern();
    }
  }
}

function tick() {
  const result = Scheduler.evaluate(data, now());
  if (result.changed) save();
  dispatch(result.announce);
  if (result.changed || result.announce.length || result.missed.length) broadcast();
}

/**
 * Reminders that Android delivered as notifications while the app was closed are marked
 * as done (not "missed"), and the latest one is shown as an active alert in the app.
 */
async function absorbBackgroundNotifications() {
  if (!(await notificationsAllowed())) return;
  const t = now();
  const r = data.reminders;
  const slots = Scheduler.reminderSlots(data);
  const latest = {};
  let changed = false;
  for (const [key, n] of Object.entries(notified)) {
    if (n.at > t) continue;
    delete notified[key];
    changed = true;
    const base = n.baseKey || key;
    if (!n.snooze && !r.fired[base]) r.fired[base] = n.at;
    if (!latest[n.instance] || n.at > latest[n.instance].at) latest[n.instance] = n;
  }
  for (const [instance, n] of Object.entries(latest)) {
    const slot = slots.find((s) => s.instance === instance);
    if (!slot || r.dismissed[instance] || t >= slot.endUtc + 15 * MINUTE) continue;
    const ack = data.alertActions[instance];
    const acked = ack && ack.at >= n.at;
    const existing = r.active.find((x) => x.instance === instance);
    if (existing && existing.lastAlertAt >= n.at) continue;
    r.active = r.active.filter((x) => x.instance !== instance);
    r.active.push({
      instance, kind: slot.kind, refId: slot.refId, title: slot.title, startUtc: slot.startUtc,
      text: slot.kind === 'task' ? Scheduler.taskText(slot.title, Math.round((slot.startUtc - n.at) / MINUTE))
        : Scheduler.meetingText(slot.title, Math.round((slot.startUtc - n.at) / MINUTE)),
      at: n.at, needsAck: !!n.attention && !acked, lastAlertAt: n.at, repeatCount: 0,
      repeatUntil: Scheduler.repeatUntilFor(slot),
    });
  }
  if (changed) { saveNotified(); save(); }
}

/* ---------------- Android notifications ---------------- */
async function notificationsAllowed() {
  if (IS_TEST && !NATIVE) return true;
  try {
    const p = await LocalNotifications.checkPermissions();
    return p.display === 'granted';
  } catch (_) { return false; }
}

function zoneLine(startUtc, zone) {
  return TZ.equivalents(startUtc, zone || 'Africa/Lagos')
    .map((e) => `${e.short} ${e.time12}${e.dayShift ? ` (${e.dateShort})` : ''}`).join(' · ');
}

/** Every reminder notification the phone should show from now on (pure). */
function planNotifications(t) {
  const r = data.reminders;
  const slots = Scheduler.reminderSlots(data);
  const repeatMs = Scheduler.attentionSettings(data).repeatMs;
  const plan = [];
  const byInstance = {};
  for (const s of slots) (byInstance[s.instance] = byInstance[s.instance] || []).push(s);

  for (const s of slots) {
    if (r.dismissed[s.instance]) continue;
    if (s.dueAt < s.armedAt) continue;
    const attention = Scheduler.wantsAttention(data, s, 'scheduled');
    if (!r.fired[s.key] && s.dueAt > t && s.dueAt - t < HORIZON_MS) {
      plan.push({ at: s.dueAt, key: s.key, baseKey: s.key, slot: s, attention, minutes: s.offset });
    }
    if (!attention) continue;
    // Repeats until acknowledged: up to the next scheduled reminder or the end of the meeting.
    const ack = data.alertActions[s.instance];
    if (ack && ack.at >= s.dueAt) continue;
    const active = r.active.find((x) => x.instance === s.instance);
    if (r.fired[s.key] && active && !active.needsAck && active.at >= s.dueAt) continue;
    const nextDue = Math.min(...byInstance[s.instance].filter((o) => o.dueAt > s.dueAt).map((o) => o.dueAt), Infinity);
    const until = Math.min(nextDue, Scheduler.repeatUntilFor(s));
    for (let k = 1; k <= MAX_REPEATS; k++) {
      const at = s.dueAt + k * repeatMs;
      if (at >= until) break;
      if (at <= t || at - t > HORIZON_MS) continue;
      plan.push({ at, key: `${s.key}:r${k}`, baseKey: s.key, slot: s, attention: true, repeat: true, minutes: Math.round((s.startUtc - at) / MINUTE) });
    }
  }
  for (const sn of r.snoozes) {
    if (sn.at <= t) continue;
    const slot = slots.find((s) => s.instance === sn.instance);
    if (!slot) continue;
    plan.push({
      at: sn.at, key: `snooze:${sn.instance}:${sn.at}`, baseKey: null, slot, snooze: true,
      attention: Scheduler.wantsAttention(data, slot, 'snooze'), minutes: Math.round((slot.startUtc - sn.at) / MINUTE),
    });
  }
  plan.sort((a, b) => a.at - b.at);
  return plan.slice(0, MAX_NOTIFICATIONS);
}

function toNotification(p, id) {
  const s = p.slot;
  const text = s.kind === 'task' ? Scheduler.taskText(s.title, p.minutes) : Scheduler.meetingText(s.title, p.minutes);
  const label = s.kind === 'task' ? 'Task reminder' : 'Meeting reminder';
  return {
    id,
    title: (p.attention ? '⚠ ' : '') + label + (p.repeat ? ' (not yet acknowledged)' : ''),
    body: text,
    largeBody: s.kind === 'task' ? text : `${text}\n${zoneLine(s.startUtc, s.timeZone)}`,
    schedule: { at: new Date(p.at), allowWhileIdle: true },
    channelId: p.attention ? 'attention' : 'reminders',
    actionTypeId: 'alert',
    autoCancel: true,
    extra: { instance: s.instance, key: p.key },
  };
}

async function rescheduleNotifications() {
  const t = now();
  const plan = planNotifications(t);
  scheduledLog.length = 0;
  scheduledLog.push(...plan.map((p) => ({ at: p.at, key: p.key, attention: !!p.attention, repeat: !!p.repeat, snooze: !!p.snooze, instance: p.slot.instance })));
  notified = {};
  for (const p of plan) notified[p.key] = { at: p.at, instance: p.slot.instance, attention: !!p.attention, baseKey: p.baseKey, snooze: !!p.snooze };
  saveNotified();
  if (!NATIVE || !(await notificationsAllowed())) return;
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
    if (plan.length) await LocalNotifications.schedule({ notifications: plan.map((p, i) => toNotification(p, i + 1)) });
  } catch (e) {
    console.error('Could not schedule notifications', e);
  }
}

function rescheduleSoon() {
  clearTimeout(rescheduleTimer);
  rescheduleTimer = setTimeout(rescheduleNotifications, 400);
}

async function setupNotifications() {
  if (!NATIVE) return;
  try {
    await LocalNotifications.createChannel({
      id: 'reminders', name: 'Meeting and task reminders', description: 'Reminders 30, 20, 10 and 5 minutes before meetings',
      importance: 4, visibility: 1, vibration: true,
    });
    await LocalNotifications.createChannel({
      id: 'attention', name: 'Attention alerts (alarm)', description: 'Loud alarm reminders that repeat until acknowledged',
      importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#FF0000', sound: 'alarm.wav',
    });
    await LocalNotifications.registerActionTypes({
      types: [{
        id: 'alert',
        actions: [
          { id: 'ack', title: 'Acknowledge' },
          { id: 'snooze', title: 'Snooze' },
          { id: 'dismiss', title: 'Dismiss', destructive: true },
        ],
      }],
    });
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === 'prompt' || perm.display === 'prompt-with-rationale') await LocalNotifications.requestPermissions();
  } catch (e) {
    console.error('Notification setup failed', e);
  }
  LocalNotifications.addListener('localNotificationActionPerformed', async ({ actionId, notification }) => {
    await ready;
    const instance = notification && notification.extra && notification.extra.instance;
    if (actionId === 'ack') await desk.acknowledge(instance);
    else if (actionId === 'snooze') await desk.snooze(instance, data.settings.snoozeMinutes);
    else if (actionId === 'dismiss') await desk.dismiss(instance);
    else emit('focus', 'alerts');
  });
}

/* ---------------- Lifecycle ---------------- */
async function onResume() {
  foreground = true;
  await absorbBackgroundNotifications();
  tick();
  broadcast();
  runSync();
}

async function onPause() {
  foreground = false;
  clearTimeout(syncTimer);
  await save();
  await rescheduleNotifications();
}

async function init() {
  data = normalize(await readJson(KEYS.data));
  session = await readJson(KEYS.session);
  notified = (await readJson(KEYS.notified)) || {};
  if (IS_TEST && params.get('offset')) clockOffset = Number(params.get('offset')) || 0;
  createSyncEngine();
  await setupNotifications();
  await absorbBackgroundNotifications();
  App.addListener('appStateChange', ({ isActive }) => (isActive ? onResume() : onPause()));
  window.addEventListener('online', () => runSync());
  setInterval(() => { if (foreground) tick(); }, TICK_MS);
  setTimeout(() => { tick(); runSync(); }, 300);
}

const ready = init();

/* ---------------- The desk interface used by the shared screens ---------------- */
async function mutate(fn) {
  await ready;
  const value = fn();
  await save();
  tick();
  broadcast();
  syncSoon();
  return value;
}

function recordAlert(instance, action) {
  const targets = instance ? [instance] : data.reminders.active.filter((x) => x.needsAck).map((x) => x.instance);
  for (const i of targets) Model.recordAlertAction(data, i, action, now());
}

let voicesCache = null;
async function voices() {
  if (!voicesCache) {
    try { voicesCache = (await TextToSpeech.getSupportedVoices()).voices || []; } catch (_) { voicesCache = []; }
  }
  return voicesCache;
}

const desk = {
  platform: 'android',
  getState: async () => { await ready; return snapshot(); },
  saveMeeting: (m) => mutate(() => Model.saveMeeting(data, m, now())),
  setMeetingStatus: (id, status) => mutate(() => Model.setMeetingStatus(data, id, status === 'cancelled' ? 'cancelled' : 'scheduled', now())),
  deleteMeeting: (id) => mutate(() => Model.deleteMeeting(data, id, now())),
  saveTask: (t) => mutate(() => Model.saveTask(data, t, now())),
  completeTask: (id, done) => mutate(() => Model.setTaskCompleted(data, id, done, now())),
  deleteTask: (id) => mutate(() => Model.deleteTask(data, id, now())),
  updateSettings: async (patch) => {
    await ready;
    const s = applySettings(data.settings, patch);
    await save();
    if (patch && ('syncProjectId' in patch)) createSyncEngine();
    broadcast();
    return s;
  },
  snooze: (instance, minutes) => {
    emit('silence', instance);
    return mutate(() => { recordAlert(instance, 'ack'); Scheduler.snooze(data, instance, Number(minutes) || data.settings.snoozeMinutes, now()); });
  },
  dismiss: (instance) => {
    emit('silence', instance);
    return mutate(() => { recordAlert(instance, 'dismiss'); Scheduler.dismiss(data, instance, now()); });
  },
  acknowledge: (instance) => {
    emit('silence', instance || null);
    return mutate(() => { recordAlert(instance || null, 'ack'); Scheduler.acknowledge(data, instance || null); });
  },
  clearMissed: (instance) => mutate(() => {
    data.reminders.missed = instance ? data.reminders.missed.filter((m) => m.instance !== instance) : [];
  }),
  openLink: async (url) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') window.open(u.toString(), '_blank');
    } catch (_) { /* ignore */ }
  },
  speakNative: async (text) => {
    const s = data.settings;
    const list = await voices();
    const idx = list.findIndex((v) => v.name === s.voiceName);
    await TextToSpeech.speak({
      text: String(text).slice(0, 500), lang: idx >= 0 ? list[idx].lang : 'en-US',
      rate: s.rate, volume: s.volume, voice: idx >= 0 ? idx : undefined, category: 'playback',
    });
    return true;
  },
  nativeVoices: async () => (await voices()).filter((v) => /^en/i.test(v.lang)).map((v) => v.name),
  hideWindow: async () => {},
  testAttention: async () => {
    await ready;
    const a = Scheduler.startTestAlert(data, now());
    await save();
    dispatch([a]);
    broadcast();
    return true;
  },
  testWebhook: async () => { throw new Error('Not used on the phone: it vibrates by itself.'); },
  showMain: async (target) => emit('focus', target),
  syncSignIn: async (email, password, create) => {
    await ready;
    if (!syncEngine.client.configured) createSyncEngine();
    try { await syncEngine.signIn(email, password, !!create); } finally { broadcast(); scheduleSync(); }
    tick();
    return syncStatus();
  },
  syncSignOut: async () => { await ready; syncEngine.signOut(); broadcast(); return syncStatus(); },
  syncResetPassword: async (email) => { await ready; return syncEngine.client.sendPasswordReset(String(email || '').trim()); },
  syncNow: async () => { await ready; try { await syncEngine.sync(); } finally { broadcast(); } return syncStatus(); },
  syncSetConfig: async (cfg) => {
    await ready;
    data.settings.syncProjectId = String((cfg && cfg.projectId) || '').trim();
    data.settings.syncApiKey = String((cfg && cfg.apiKey) || '').trim();
    await save();
    createSyncEngine();
    broadcast();
    return syncStatus();
  },
  // Phone permissions
  phoneStatus: async () => {
    if (!NATIVE) return { notifications: 'granted', exactAlarm: 'granted' };
    const [p, e] = await Promise.all([
      LocalNotifications.checkPermissions().catch(() => ({ display: 'denied' })),
      LocalNotifications.checkExactNotificationSetting().catch(() => ({ exact_alarm: 'granted' })),
    ]);
    return { notifications: p.display, exactAlarm: e.exact_alarm };
  },
  requestNotifications: async () => {
    if (NATIVE) await LocalNotifications.requestPermissions();
    rescheduleSoon();
  },
  openExactAlarmSettings: async () => { if (NATIVE) await LocalNotifications.changeExactNotificationSetting(); rescheduleSoon(); },
  testVibration: () => vibratePattern(),
  onState: (cb) => on('state', cb),
  onAnnounce: (cb) => on('announce', cb),
  onFocus: (cb) => on('focus', cb),
  onAttentionAlert: (cb) => on('attention-alert', cb),
  onSilence: (cb) => on('silence', cb),
  test: {
    setClockOffset: async (ms) => { await ready; clockOffset = Number(ms) || 0; if (foreground) { tick(); broadcast(); } return clockOffset; },
    tick: async () => { await ready; tick(); return snapshot(); },
    quit: async () => {},
    scheduled: async () => { await ready; await rescheduleNotifications(); return scheduledLog.slice(); },
    simulateBackground: async () => { await ready; await onPause(); },
    simulateResume: async () => { await ready; await onResume(); },
  },
};

window.desk = desk;
