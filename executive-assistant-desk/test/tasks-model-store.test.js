const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Tasks = require('../src/shared/tasks');
const Model = require('../src/main/model');
const { Store, emptyData } = require('../src/main/store');

const ymd = (d) => Tasks.localDateStr(d.getTime());
const NOW = new Date(2026, 9, 21, 14, 0).getTime(); // 21 Oct 2026, 2:00 PM local

test('task status: overdue, due today, upcoming, completed', () => {
  const data = emptyData();
  const yesterday = ymd(new Date(2026, 9, 20));
  const today = ymd(new Date(2026, 9, 21));
  const tomorrow = ymd(new Date(2026, 9, 22));
  const a = Model.saveTask(data, { title: 'Yesterday', dueDate: yesterday }, NOW);
  const b = Model.saveTask(data, { title: 'Today 9am', dueDate: today, dueTime: '09:00' }, NOW);
  const c = Model.saveTask(data, { title: 'Today 5pm', dueDate: today, dueTime: '17:00' }, NOW);
  const d = Model.saveTask(data, { title: 'Today any time', dueDate: today }, NOW);
  const e = Model.saveTask(data, { title: 'Tomorrow', dueDate: tomorrow }, NOW);
  assert.equal(Tasks.status(a, NOW), 'overdue');
  assert.equal(Tasks.status(b, NOW), 'overdue'); // due time passed
  assert.equal(Tasks.status(c, NOW), 'today');
  assert.equal(Tasks.status(d, NOW), 'today');
  assert.equal(Tasks.status(e, NOW), 'upcoming');
  const g = Tasks.group(data.tasks, NOW);
  assert.deepEqual(g.overdue.map((t) => t.title), ['Yesterday', 'Today 9am']);
  assert.deepEqual(g.today.map((t) => t.title), ['Today 5pm', 'Today any time']);
});

test('unfinished tasks stay visible (overdue) until completed; reopen works', () => {
  const data = emptyData();
  const t = Model.saveTask(data, { title: 'File expense report', dueDate: '2026-10-01' }, NOW);
  const weekLater = NOW + 7 * 864e5;
  assert.equal(Tasks.status(t, weekLater), 'overdue');
  Model.setTaskCompleted(data, t.id, true, NOW);
  assert.equal(t.completed, true);
  assert.equal(t.completedAt, NOW);
  assert.equal(Tasks.status(t, weekLater), 'completed');
  Model.setTaskCompleted(data, t.id, false, NOW + 1000);
  assert.equal(t.completed, false);
  assert.equal(t.completedAt, null);
  assert.equal(Tasks.status(t, weekLater), 'overdue');
});

test('spoken task reminders require a due time', () => {
  const data = emptyData();
  const t = Model.saveTask(data, { title: 'No time', dueDate: '2026-10-21', speak: true }, NOW);
  assert.equal(t.speak, false);
});

test('meeting validation and link handling', () => {
  const data = emptyData();
  assert.throws(() => Model.saveMeeting(data, { title: '', date: '2026-10-21', time: '10:00', timeZone: 'Africa/Lagos', duration: 30 }, NOW), /title/);
  assert.throws(() => Model.saveMeeting(data, { title: 'x', date: '2026-10-21', time: '10:00', timeZone: 'Europe/Paris', duration: 30 }, NOW), /time zone/);
  assert.throws(() => Model.saveMeeting(data, { title: 'x', date: '2026-10-21', time: '10:00', timeZone: 'Africa/Lagos', duration: 30, link: 'javascript:alert(1)' }, NOW), /link/);
  const { meeting } = Model.saveMeeting(data, { title: 'x', date: '2026-10-21', time: '10:00', timeZone: 'Africa/Lagos', duration: 30, link: 'zoom.us/j/123' }, NOW);
  assert.equal(meeting.link, 'https://zoom.us/j/123');
});

test('saving a meeting at a skipped DST time warns and adjusts', () => {
  const data = emptyData();
  const { meeting, warning } = Model.saveMeeting(data, { title: 'x', date: '2026-03-08', time: '02:15', timeZone: 'America/New_York', duration: 30 }, NOW);
  assert.equal(meeting.time, '03:15');
  assert.match(warning, /does not exist/);
});

test('data is saved to disk and reloaded after restart; corrupted file falls back to backup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ead-store-'));
  const s1 = new Store(dir);
  s1.load();
  Model.saveMeeting(s1.data, { title: 'Budget review', date: '2026-10-22', time: '10:00', timeZone: 'Africa/Lagos', duration: 60 }, NOW);
  const t = Model.saveTask(s1.data, { title: 'Book flights', dueDate: '2026-10-21' }, NOW);
  s1.data.settings.volume = 0.4;
  s1.save();
  Model.setTaskCompleted(s1.data, t.id, true, NOW);
  s1.save();

  const s2 = new Store(dir);
  s2.load();
  assert.equal(s2.data.meetings[0].title, 'Budget review');
  assert.equal(s2.data.tasks[0].completed, true);
  assert.equal(s2.data.settings.volume, 0.4);
  assert.equal(s2.data.settings.muted, false); // defaults filled in

  fs.writeFileSync(path.join(dir, 'data.json'), '{ broken');
  const s3 = new Store(dir);
  s3.load();
  assert.equal(s3.data.meetings.length, 1, 'recovered from data.json.bak');
  fs.rmSync(dir, { recursive: true });
});
