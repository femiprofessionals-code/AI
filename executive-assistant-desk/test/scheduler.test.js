const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../src/main/scheduler');
const Model = require('../src/main/model');
const TZ = require('../src/shared/tz');
const { Store, emptyData } = require('../src/main/store');

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 21, 8, 0); // 21 Oct 2026 08:00Z

/** Run the engine every `step` ms from `from` to `to`, collecting announcements. */
function run(data, from, to, step = 5000) {
  const said = [];
  const missed = [];
  for (let t = from; t <= to; t += step) {
    const r = S.evaluate(data, t);
    for (const a of r.announce) said.push({ ...a, t });
    missed.push(...r.missed);
  }
  return { said, missed };
}

function addMeeting(data, now, startUtc, extra = {}) {
  const zone = extra.timeZone || 'Africa/Lagos';
  return Model.saveMeeting(data, {
    title: 'Budget review with the Executive Director', date: TZ.dateIn(startUtc, zone),
    time: TZ.timeIn(startUtc, zone), timeZone: zone, duration: 60, ...extra,
  }, now).meeting;
}

test('announces exactly at 30, 20, 10 and 5 minutes before, once each', () => {
  const data = emptyData();
  const start = T0 + 60 * MIN;
  addMeeting(data, T0, start);
  const { said, missed } = run(data, T0, start + 10 * MIN);
  assert.deepEqual(said.map((a) => a.offset), [30, 20, 10, 5]);
  for (const a of said) {
    const late = a.t - (start - a.offset * MIN);
    assert.ok(late >= 0 && late < 5000, `announced ${late} ms after due`);
  }
  assert.equal(said[1].text, 'Reminder: Budget review with the Executive Director starts in 20 minutes.');
  assert.equal(missed.length, 0);
});

test('re-evaluating at the same moment never repeats an announcement', () => {
  const data = emptyData();
  const start = T0 + 31 * MIN;
  addMeeting(data, T0, start);
  const due = start - 30 * MIN;
  assert.equal(S.evaluate(data, due).announce.length, 1);
  assert.equal(S.evaluate(data, due).announce.length, 0);
  assert.equal(S.evaluate(data, due + 1000).announce.length, 0);
});

test('a meeting added 25 minutes ahead skips the 30-minute reminder without reporting it missed', () => {
  const data = emptyData();
  const start = T0 + 25 * MIN;
  addMeeting(data, T0, start);
  const { said, missed } = run(data, T0, start);
  assert.deepEqual(said.map((a) => a.offset), [20, 10, 5]);
  assert.equal(missed.length, 0);
});

test('rescheduling recalculates reminders for the new time', () => {
  const data = emptyData();
  const start = T0 + 40 * MIN;
  const m = addMeeting(data, T0, start);
  const first = run(data, T0, T0 + 12 * MIN); // 30-minute reminder fires at T0+10
  assert.deepEqual(first.said.map((a) => a.offset), [30]);

  const now = T0 + 12 * MIN;
  const newStart = T0 + 3 * 60 * MIN;
  Model.saveMeeting(data, { ...m, date: TZ.dateIn(newStart, 'Africa/Lagos'), time: TZ.timeIn(newStart, 'Africa/Lagos') }, now);
  assert.equal(m.history.length, 1);
  const { said, missed } = run(data, now, newStart);
  assert.deepEqual(said.map((a) => a.offset), [30, 20, 10, 5]);
  assert.ok(said.every((a) => a.startUtc === newStart));
  assert.equal(missed.length, 0, 'old reminders are not reported as missed');
});

test('editing only the title does not replay reminders that already played', () => {
  const data = emptyData();
  const start = T0 + 40 * MIN;
  const m = addMeeting(data, T0, start);
  run(data, T0, T0 + 12 * MIN);
  Model.saveMeeting(data, { ...m, title: 'Budget review (moved room)' }, T0 + 12 * MIN);
  const { said } = run(data, T0 + 12 * MIN, start);
  assert.deepEqual(said.map((a) => a.offset), [20, 10, 5]);
  assert.match(said[0].text, /moved room/);
});

test('cancelling stops reminders; restoring brings back only future ones', () => {
  const data = emptyData();
  const start = T0 + 60 * MIN;
  const m = addMeeting(data, T0, start);
  Model.setMeetingStatus(data, m.id, 'cancelled', T0);
  assert.equal(run(data, T0, T0 + 45 * MIN).said.length, 0);
  Model.setMeetingStatus(data, m.id, 'scheduled', T0 + 45 * MIN); // 15 min before start
  const { said, missed } = run(data, T0 + 45 * MIN, start);
  assert.deepEqual(said.map((a) => a.offset), [10, 5]);
  assert.equal(missed.length, 0);
});

test('after sleep, expired reminders are listed as missed and not spoken', () => {
  const data = emptyData();
  const start = T0 + 60 * MIN;
  addMeeting(data, T0, start);
  run(data, T0, T0 + 20 * MIN); // nothing due yet
  // Computer sleeps, wakes 7 minutes before the meeting.
  const wake = start - 7 * MIN;
  const r = S.evaluate(data, wake);
  assert.equal(r.announce.length, 0);
  assert.deepEqual(r.missed.map((m) => m.offset).sort((a, b) => a - b), [10, 20, 30]);
  assert.equal(data.reminders.missed.length, 3);
  // The 5-minute reminder still plays on time.
  const { said } = run(data, wake, start);
  assert.deepEqual(said.map((a) => a.offset), [5]);
});

test('waking just after a reminder was due speaks only that one', () => {
  const data = emptyData();
  const start = T0 + 60 * MIN;
  addMeeting(data, T0, start);
  const r = S.evaluate(data, start - 4.5 * MIN);
  assert.deepEqual(r.announce.map((a) => a.offset), [5]);
  assert.deepEqual(r.missed.map((m) => m.offset).sort((a, b) => a - b), [10, 20, 30]);
});

test('reminder state survives a restart (saved to disk) without repeats', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ead-'));
  const store = new Store(dir);
  store.load();
  const start = T0 + 60 * MIN;
  addMeeting(store.data, T0, start);
  const a = run(store.data, T0, T0 + 31 * MIN); // 30-minute reminder
  assert.deepEqual(a.said.map((x) => x.offset), [30]);
  store.save();

  const reopened = new Store(dir);
  reopened.load();
  assert.equal(reopened.data.meetings.length, 1);
  const b = run(reopened.data, T0 + 31 * MIN, start);
  assert.deepEqual(b.said.map((x) => x.offset), [20, 10, 5]);
  fs.rmSync(dir, { recursive: true });
});

test('overlapping meetings are both announced, ordered by start time', () => {
  const data = emptyData();
  addMeeting(data, T0, T0 + 65 * MIN, { title: 'Board call' });
  addMeeting(data, T0, T0 + 60 * MIN, { title: 'Budget review' });
  addMeeting(data, T0, T0 + 60 * MIN, { title: 'Press briefing', timeZone: 'America/Toronto' });
  const r = S.evaluate(data, T0 + 30 * MIN); // 30-minute reminder for both 09:00Z meetings
  assert.equal(r.announce.length, 2);
  assert.notEqual(r.announce[0].key, r.announce[1].key);
  const all = run(data, T0, T0 + 65 * MIN);
  assert.equal(all.said.length, 12 - 2); // the two already announced are not repeated
  for (let i = 1; i < all.said.length; i++) {
    if (all.said[i].t === all.said[i - 1].t) assert.ok(all.said[i].startUtc >= all.said[i - 1].startUtc);
  }
});

test('snooze replays the reminder later with the real time remaining', () => {
  const data = emptyData();
  const start = T0 + 60 * MIN;
  const m = addMeeting(data, T0, start);
  run(data, T0, T0 + 30 * MIN);
  const inst = S.meetingInstanceKey(m);
  assert.equal(data.reminders.active.length, 1);
  S.snooze(data, inst, 5, T0 + 30 * MIN);
  assert.equal(data.reminders.active.length, 0);
  const { said } = run(data, T0 + 30 * MIN + 5000, T0 + 41 * MIN);
  assert.equal(said[0].reason, 'snooze');
  assert.equal(said[0].text, 'Reminder: Budget review with the Executive Director starts in 25 minutes.');
  assert.equal(said[1].offset, 20);
});

test('a snooze that lands on a scheduled reminder plays only once', () => {
  const data = emptyData();
  const start = T0 + 60 * MIN;
  const m = addMeeting(data, T0, start);
  run(data, T0, T0 + 30 * MIN);
  S.snooze(data, S.meetingInstanceKey(m), 10, T0 + 30 * MIN);
  const { said } = run(data, T0 + 30 * MIN + 5000, T0 + 45 * MIN);
  assert.equal(said.length, 1);
});

test('dismiss stops all remaining reminders for that meeting', () => {
  const data = emptyData();
  const start = T0 + 60 * MIN;
  const m = addMeeting(data, T0, start);
  run(data, T0, T0 + 30 * MIN);
  S.dismiss(data, S.meetingInstanceKey(m), T0 + 30 * MIN);
  const { said, missed } = run(data, T0 + 30 * MIN, start + 5 * MIN);
  assert.equal(said.length, 0);
  assert.equal(missed.length, 0);
});

test('reminders straddling a DST change fire at the right instants', () => {
  // 03:30 EDT on 8 March 2026 (the first hour after clocks spring forward in Toronto).
  const data = emptyData();
  const now = Date.UTC(2026, 2, 8, 6, 0);
  const m = Model.saveMeeting(data, { title: 'Early call', date: '2026-03-08', time: '03:30', timeZone: 'America/Toronto', duration: 30 }, now).meeting;
  assert.equal(new Date(m.startUtc).toISOString(), '2026-03-08T07:30:00.000Z');
  const { said } = run(data, now, m.startUtc);
  assert.deepEqual(said.map((a) => new Date(a.t).toISOString().slice(11, 16)), ['07:00', '07:10', '07:20', '07:25']);

  // 09:00 on the day clocks fall back (1 Nov 2026) is EST = 14:00Z, 15:00 in Lagos.
  const d2 = emptyData();
  const now2 = Date.UTC(2026, 9, 31, 12, 0);
  const m2 = Model.saveMeeting(d2, { title: 'Sunday sync', date: '2026-11-01', time: '09:00', timeZone: 'America/Toronto', duration: 30 }, now2).meeting;
  assert.equal(new Date(m2.startUtc).toISOString(), '2026-11-01T14:00:00.000Z');
  assert.equal(TZ.timeIn(m2.startUtc, 'Africa/Lagos'), '15:00');
  const r = run(d2, Date.UTC(2026, 10, 1, 13, 0), m2.startUtc);
  assert.deepEqual(r.said.map((a) => a.offset), [30, 20, 10, 5]);
  assert.equal(new Date(r.said[0].t).toISOString().slice(11, 16), '13:30');
});

test('spoken task reminders fire once at the due time, and not once completed', () => {
  const data = emptyData();
  const due = new Date(T0 + 30 * MIN);
  const ymd = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
  const hm = `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
  const t = Model.saveTask(data, { title: 'Send board packet', dueDate: ymd, dueTime: hm, priority: 'high', speak: true, leadMinutes: 10 }, T0);
  const { said } = run(data, T0, T0 + 40 * MIN);
  assert.equal(said.length, 1);
  assert.equal(said[0].text, 'Task reminder: Send board packet is due in 10 minutes.');
  assert.ok(said[0].t >= T0 + 20 * MIN && said[0].t < T0 + 20 * MIN + 5000);

  const d2 = emptyData();
  const t2 = Model.saveTask(d2, { title: 'Call caterer', dueDate: ymd, dueTime: hm, speak: true }, T0);
  Model.setTaskCompleted(d2, t2.id, true, T0 + MIN);
  assert.equal(run(d2, T0, T0 + 40 * MIN).said.length, 0);
  void t;
});

test('an on-screen reminder is cleared when a later one is missed during sleep', () => {
  const data = emptyData();
  const start = T0 + 60 * MIN;
  addMeeting(data, T0, start);
  run(data, T0, T0 + 41 * MIN); // 30 and 20 announced
  assert.equal(data.reminders.active.length, 1);
  S.evaluate(data, start - 7 * MIN); // 10-minute reminder missed
  assert.equal(data.reminders.active.length, 0);
});
