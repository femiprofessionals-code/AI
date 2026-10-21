const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/main/scheduler');
const Model = require('../src/main/model');
const TZ = require('../src/shared/tz');
const { emptyData } = require('../src/main/store');

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 21, 8, 0);

function setup(settings = {}) {
  const data = emptyData();
  Object.assign(data.settings, { attentionEnabled: true, repeatSeconds: 60 }, settings);
  const start = T0 + 60 * MIN;
  const m = Model.saveMeeting(data, {
    title: 'Budget review', date: TZ.dateIn(start, 'Africa/Lagos'), time: TZ.timeIn(start, 'Africa/Lagos'),
    timeZone: 'Africa/Lagos', duration: 30,
  }, T0).meeting;
  return { data, start, m, inst: S.meetingInstanceKey(m) };
}

function run(data, from, to, step = 5000) {
  const said = [];
  for (let t = from; t <= to; t += step) for (const a of S.evaluate(data, t).announce) said.push({ ...a, t });
  return said;
}

test('attention reminders are flagged and repeat every interval until acknowledged', () => {
  const { data, start, inst } = setup();
  const said = run(data, T0, start - 27 * MIN);
  assert.equal(said[0].attention, true);
  assert.equal(said[0].offset, 30);
  const repeats = said.filter((a) => a.reason === 'repeat');
  assert.equal(repeats.length, 3); // at 29, 28 and 27 minutes before
  assert.equal(repeats[0].text, 'Reminder: Budget review starts in 29 minutes.');
  for (let i = 1; i < said.length; i++) assert.equal(said[i].t - said[i - 1].t, MIN);
  assert.ok(new Set(said.map((a) => a.key)).size === said.length, 'every alert has a unique key');

  assert.equal(S.acknowledge(data, inst), 1);
  const after = run(data, start - 27 * MIN + 5000, start - 21 * MIN);
  assert.equal(after.length, 0, 'no repeats after acknowledging');
  assert.equal(data.reminders.active.length, 1, 'banner stays until dismissed');
  const next = run(data, start - 21 * MIN, start - 19 * MIN - 5000);
  assert.equal(next.length, 1);
  assert.equal(next[0].offset, 20, 'the next scheduled reminder still sounds');
  assert.equal(next[0].attention, true);
});

test('a new scheduled reminder replaces the repeating one (no double alarm)', () => {
  const { data, start } = setup({ repeatSeconds: 300 });
  const said = run(data, T0, start - 16 * MIN);
  assert.deepEqual(said.map((a) => a.reason), ['scheduled', 'repeat', 'scheduled']);
  assert.deepEqual(said.map((a) => Math.round((start - a.t) / MIN)), [30, 25, 20]);
});

test('repeats stop when the meeting ends even if never acknowledged', () => {
  const { data, start } = setup({ attentionOffsets: [5], repeatSeconds: 120 });
  const said = run(data, T0, start + 60 * MIN).filter((a) => a.attention);
  assert.equal(said[0].offset, 5);
  const last = said[said.length - 1];
  assert.ok(last.t < start + 30 * MIN, 'nothing after the 30-minute meeting ends');
  assert.match(said.find((a) => a.t > start).text, /started 1 minute ago|started \d+ minutes ago/);
});

test('after sleep, an unacknowledged alert does not replay', () => {
  const { data, start } = setup();
  run(data, T0, start - 30 * MIN);
  const r = S.evaluate(data, start - 24 * MIN); // slept for 6 minutes
  assert.equal(r.announce.filter((a) => a.reason === 'repeat').length, 0);
  assert.equal(data.reminders.active[0].needsAck, false);
});

test('only the chosen reminder times use attention mode', () => {
  const { data, start } = setup({ attentionOffsets: [10, 5] });
  const said = run(data, T0, start).filter((a) => a.reason === 'scheduled');
  assert.deepEqual(said.map((a) => [a.offset, a.attention]), [[30, false], [20, false], [10, true], [5, true]]);
});

test('attention mode off: no flags, no repeats', () => {
  const { data, start } = setup({ attentionEnabled: false });
  const said = run(data, T0, start);
  assert.equal(said.length, 4);
  assert.ok(said.every((a) => !a.attention));
});

test('turning attention mode off stops current repeats', () => {
  const { data, start } = setup();
  run(data, T0, start - 30 * MIN);
  data.settings.attentionEnabled = false;
  assert.equal(run(data, start - 30 * MIN + 5000, start - 25 * MIN).length, 0);
});

test('snooze and dismiss also stop the alarm', () => {
  const a = setup();
  run(a.data, T0, a.start - 30 * MIN);
  S.snooze(a.data, a.inst, 5, a.start - 30 * MIN);
  const s1 = run(a.data, a.start - 30 * MIN + 5000, a.start - 25 * MIN);
  assert.deepEqual(s1.map((x) => x.reason), ['snooze']);
  assert.equal(s1[0].attention, true);

  const b = setup();
  run(b.data, T0, b.start - 30 * MIN);
  S.dismiss(b.data, b.inst, b.start - 30 * MIN);
  assert.equal(run(b.data, b.start - 30 * MIN + 5000, b.start).length, 0);
});

test('test alert repeats every 20 seconds, at most 3 times, until acknowledged', () => {
  const data = emptyData();
  const first = S.startTestAlert(data, T0);
  assert.equal(first.attention, true);
  assert.equal(first.text, 'Reminder: Budget review with the Executive Director starts in 20 minutes.');
  const said = run(data, T0 + 5000, T0 + 3 * MIN);
  assert.equal(said.length, 3);
  assert.deepEqual(said.map((a) => a.t - T0), [20000, 40000, 60000]);

  const d2 = emptyData();
  S.startTestAlert(d2, T0);
  S.acknowledge(d2, S.TEST_INSTANCE);
  assert.equal(run(d2, T0 + 5000, T0 + 3 * MIN).length, 0);
});

test('task reminders use attention mode when enabled for tasks', () => {
  const data = emptyData();
  Object.assign(data.settings, { attentionEnabled: true, attentionTasks: true });
  const due = new Date(T0 + 10 * MIN);
  const ymd = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  const hm = `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
  Model.saveTask(data, { title: 'Call caterer', dueDate: ymd, dueTime: hm, speak: true }, T0);
  const said = run(data, T0, T0 + 12 * MIN);
  assert.equal(said[0].attention, true);
  assert.equal(said[1].text, 'Task reminder: Call caterer was due 1 minute ago.');
});
