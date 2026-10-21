const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

function on(channel, cb) {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('desk', {
  getState: () => call('state:get'),
  saveMeeting: (m) => call('meeting:save', m),
  setMeetingStatus: (id, status) => call('meeting:status', id, status),
  deleteMeeting: (id) => call('meeting:delete', id),
  saveTask: (t) => call('task:save', t),
  completeTask: (id, done) => call('task:complete', id, done),
  deleteTask: (id) => call('task:delete', id),
  updateSettings: (p) => call('settings:update', p),
  snooze: (instance, minutes) => call('reminder:snooze', instance, minutes),
  dismiss: (instance) => call('reminder:dismiss', instance),
  acknowledge: (instance) => call('reminder:acknowledge', instance),
  testAttention: () => call('attention:test'),
  testWebhook: (draft) => call('vibration:testWebhook', draft),
  showMain: (target) => call('app:showMain', target),
  onAttentionAlert: (cb) => on('attention-alert', cb),
  onSilence: (cb) => on('silence', cb),
  clearMissed: (instance) => call('missed:clear', instance),
  openLink: (url) => call('link:open', url),
  speakNative: (text) => call('speech:native', text),
  nativeVoices: () => call('speech:nativeVoices'),
  hideWindow: () => call('app:hide'),
  onState: (cb) => on('state', cb),
  onAnnounce: (cb) => on('announce', cb),
  onFocus: (cb) => on('focus', cb),
  test: {
    setClockOffset: (ms) => call('test:setClockOffset', ms),
    tick: () => call('test:tick'),
    quit: () => call('test:quit'),
  },
});
