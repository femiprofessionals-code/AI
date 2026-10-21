/*
 * Shape of the saved data, shared by the desktop app (file storage) and the
 * Android app (on-device storage).
 */
const DEFAULT_SETTINGS = {
  voiceName: '',
  volume: 0.9,
  rate: 1,
  muted: false,
  speechEngine: 'browser', // 'browser' (Chromium speech) or 'windows' (PowerShell System.Speech)
  syncProjectId: '', // Firebase project, only needed when the build has no sync-config.json values
  syncApiKey: '',
  notifications: true,
  openAtLogin: false,
  startHidden: true,
  snoozeMinutes: 5,
  trayHintShown: false,
  // Attention mode: loud alarm, then the spoken reminder, repeated until acknowledged.
  attentionEnabled: false,
  attentionOffsets: [30, 20, 10, 5],
  attentionTasks: true,
  alarmSound: 'siren', // 'siren' | 'beeps' | 'bell'
  alarmVolume: 1,
  alarmSeconds: 4,
  repeatSeconds: 60,
  flashing: true,
  // Optional external vibration (the computer itself is never assumed to vibrate).
  vibrateGamepad: false,
  webhookEnabled: false,
  webhookType: 'ntfy', // 'ntfy' (phone/watch via the ntfy app) | 'json' (any service accepting a JSON POST)
  webhookUrl: '',
  // Android app only: vibrate the phone itself with attention alerts.
  phoneVibrate: true,
};

function emptyData() {
  return {
    version: 1,
    meetings: [],
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    reminders: { fired: {}, dismissed: {}, snoozes: [], missed: [], active: [] },
    // Acknowledge / dismiss decisions, shared between devices so an alert stopped on one stops on the other.
    alertActions: {},
    sync: emptySync(),
  };
}

function emptySync() {
  return {
    deviceId: '',
    email: '',
    uid: '',
    cursor: null, // server time of the newest change already pulled
    dirty: {}, // "meetings/<id>" etc. changed locally and not yet uploaded
    tombstones: {}, // deleted records still to be uploaded as deletions
    lastSyncAt: 0,
    lastError: '',
  };
}

function normalize(raw) {
  const d = emptyData();
  if (!raw || typeof raw !== 'object') return d;
  d.meetings = Array.isArray(raw.meetings) ? raw.meetings : [];
  d.tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  d.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
  const r = raw.reminders || {};
  d.reminders = {
    fired: r.fired && typeof r.fired === 'object' ? r.fired : {},
    dismissed: r.dismissed && typeof r.dismissed === 'object' ? r.dismissed : {},
    snoozes: Array.isArray(r.snoozes) ? r.snoozes : [],
    missed: Array.isArray(r.missed) ? r.missed : [],
    active: Array.isArray(r.active) ? r.active : [],
  };
  d.alertActions = raw.alertActions && typeof raw.alertActions === 'object' ? raw.alertActions : {};
  d.sync = { ...emptySync(), ...(raw.sync || {}) };
  if (!d.sync.dirty || typeof d.sync.dirty !== 'object') d.sync.dirty = {};
  if (!d.sync.tombstones || typeof d.sync.tombstones !== 'object') d.sync.tombstones = {};
  return d;
}


const SETTING_TYPES = {
  voiceName: 'string', volume: 'number', rate: 'number', muted: 'boolean', speechEngine: 'string',
  notifications: 'boolean', openAtLogin: 'boolean', startHidden: 'boolean', snoozeMinutes: 'number',
  attentionEnabled: 'boolean', attentionTasks: 'boolean', alarmSound: 'string', alarmVolume: 'number',
  alarmSeconds: 'number', repeatSeconds: 'number', flashing: 'boolean', vibrateGamepad: 'boolean',
  webhookEnabled: 'boolean', webhookType: 'string', webhookUrl: 'string', phoneVibrate: 'boolean',
};
const REMINDER_OFFSETS = [30, 20, 10, 5];

function webhookUrlValid(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (_) { return false; }
}

/** Apply a settings change from the interface, keeping every value within its allowed range. */
function applySettings(s, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (SETTING_TYPES[k] && typeof v === SETTING_TYPES[k]) s[k] = v;
  }
  s.volume = Math.min(1, Math.max(0, s.volume));
  s.rate = Math.min(2, Math.max(0.5, s.rate));
  s.snoozeMinutes = [1, 2, 5, 10, 15].includes(s.snoozeMinutes) ? s.snoozeMinutes : 5;
  if (!['browser', 'windows'].includes(s.speechEngine)) s.speechEngine = 'browser';
  if (Array.isArray(patch && patch.attentionOffsets)) {
    s.attentionOffsets = REMINDER_OFFSETS.filter((o) => patch.attentionOffsets.includes(o));
  }
  if (!['siren', 'beeps', 'bell'].includes(s.alarmSound)) s.alarmSound = 'siren';
  s.alarmVolume = Math.min(1, Math.max(0.05, s.alarmVolume));
  s.alarmSeconds = [2, 4, 6, 10].includes(s.alarmSeconds) ? s.alarmSeconds : 4;
  s.repeatSeconds = [30, 60, 120, 180, 300].includes(s.repeatSeconds) ? s.repeatSeconds : 60;
  if (!['ntfy', 'json'].includes(s.webhookType)) s.webhookType = 'ntfy';
  s.webhookUrl = String(s.webhookUrl || '').trim().slice(0, 1000);
  if (s.webhookEnabled && !webhookUrlValid(s.webhookUrl)) s.webhookEnabled = false;
  return s;
}

module.exports = { DEFAULT_SETTINGS, emptyData, emptySync, normalize, applySettings, webhookUrlValid };
