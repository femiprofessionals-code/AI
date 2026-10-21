/*
 * Local JSON storage in the app's user-data folder
 * (%APPDATA%\Executive Assistant Desk\data.json on Windows).
 * Writes go to a temp file first and are renamed into place so a crash or
 * power loss never leaves a half-written file; the previous copy is kept as data.json.bak.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  voiceName: '',
  volume: 0.9,
  rate: 1,
  muted: false,
  speechEngine: 'browser', // 'browser' (Chromium speech) or 'windows' (PowerShell System.Speech)
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
};

function emptyData() {
  return {
    version: 1,
    meetings: [],
    tasks: [],
    settings: { ...DEFAULT_SETTINGS },
    reminders: { fired: {}, dismissed: {}, snoozes: [], missed: [], active: [] },
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
  return d;
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'data.json');
    this.data = emptyData();
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    for (const f of [this.file, this.file + '.bak']) {
      try {
        this.data = normalize(JSON.parse(fs.readFileSync(f, 'utf8')));
        return this.data;
      } catch (e) {
        if (e.code !== 'ENOENT') console.error('Could not read', f, e.message);
      }
    }
    this.data = emptyData();
    return this.data;
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    if (fs.existsSync(this.file)) {
      try { fs.copyFileSync(this.file, this.file + '.bak'); } catch (_) { /* best effort */ }
    }
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store, DEFAULT_SETTINGS, emptyData, normalize };
