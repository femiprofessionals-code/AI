/*
 * Sync tests against the Firebase emulators (real Auth + Firestore REST behaviour and
 * the real security rules). Run with:  npm run test:sync
 * Two "devices" each have their own data, as the desktop app and the phone would.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { FirebaseClient, SyncEngine } = require('../../src/shared/sync');
const { emptyData } = require('../../src/shared/data');
const Model = require('../../src/main/model');

const EMU = { auth: 'http://127.0.0.1:9099', firestore: 'http://127.0.0.1:8080' };
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-ead';
let n = 0;
const uniqueEmail = () => `assistant${Date.now()}${n++}@example.com`;

function device(name, opts = {}) {
  const dev = { name, data: emptyData(), session: null, changes: [], online: true };
  const realFetch = globalThis.fetch.bind(globalThis);
  dev.client = new FirebaseClient({
    apiKey: 'fake-api-key', projectId: PROJECT, emulator: EMU,
    fetch: (url, init) => (dev.online ? realFetch(url, init) : Promise.reject(new TypeError('fetch failed'))),
  });
  dev.engine = new SyncEngine({
    data: () => dev.data,
    client: dev.client,
    loadSession: () => dev.session,
    saveSession: (s) => { dev.session = s; },
    persist: () => {},
    onRemoteChange: (c) => dev.changes.push(...c),
    ...opts,
  });
  return dev;
}

const meetingInput = (title, extra = {}) => ({ title, date: '2026-11-03', time: '10:00', timeZone: 'Africa/Lagos', duration: 60, ...extra });

test('a meeting and task created on the desktop appear on the phone', async () => {
  const email = uniqueEmail();
  const pc = device('pc');
  const phone = device('phone');
  Model.saveMeeting(pc.data, meetingInput('Budget review'), 1000);
  Model.saveTask(pc.data, { title: 'Send board packet', dueDate: '2026-11-03' }, 1000);
  await pc.engine.signIn(email, 'secret123', true);
  assert.equal(Object.keys(pc.data.sync.dirty).length, 0, 'everything uploaded');

  await phone.engine.signIn(email, 'secret123', false);
  assert.equal(phone.data.meetings.length, 1);
  assert.equal(phone.data.meetings[0].title, 'Budget review');
  assert.equal(phone.data.meetings[0].startUtc, pc.data.meetings[0].startUtc);
  assert.equal(phone.data.tasks[0].title, 'Send board packet');
});

test('edits, completion and deletions flow both ways', async () => {
  const email = uniqueEmail();
  const pc = device('pc');
  const phone = device('phone');
  const m = Model.saveMeeting(pc.data, meetingInput('Board call'), 1000).meeting;
  const t = Model.saveTask(pc.data, { title: 'Book flights', dueDate: '2026-11-03' }, 1000);
  await pc.engine.signIn(email, 'secret123', true);
  await phone.engine.signIn(email, 'secret123');

  Model.setTaskCompleted(phone.data, t.id, true, 5000);
  Model.saveMeeting(phone.data, { ...phone.data.meetings[0], time: '14:30' }, 5000); // reschedule on phone
  await phone.engine.sync();
  await pc.engine.sync();
  assert.equal(pc.data.tasks[0].completed, true);
  assert.equal(pc.data.meetings[0].time, '14:30');
  assert.ok(pc.changes.some((c) => c.type === 'meetings' && c.id === m.id), 'desktop told about the change (to recalculate reminders)');

  Model.deleteMeeting(pc.data, m.id, 9000);
  await pc.engine.sync();
  await phone.engine.sync();
  assert.equal(phone.data.meetings.length, 0, 'deletion reached the phone');
  assert.equal(Object.keys(pc.data.sync.tombstones).length, 0, 'tombstone cleared after upload');
});

test('working offline: changes are kept and uploaded when the connection returns', async () => {
  const email = uniqueEmail();
  const pc = device('pc');
  const phone = device('phone');
  await pc.engine.signIn(email, 'secret123', true);
  await phone.engine.signIn(email, 'secret123');

  pc.online = false; // the desktop is switched off / offline
  phone.online = false;
  Model.saveTask(phone.data, { title: 'Call the caterer', dueDate: '2026-11-04' }, 2000);
  await assert.rejects(phone.engine.sync(), /No internet connection/);
  assert.equal(phone.data.tasks.length, 1, 'phone keeps working offline');
  assert.equal(Object.keys(phone.data.sync.dirty).length, 1, 'change waits for upload');
  assert.ok(phone.session, 'still signed in after an offline failure');

  phone.online = true;
  await phone.engine.sync();
  assert.equal(Object.keys(phone.data.sync.dirty).length, 0);
  pc.online = true; // desktop turned on later
  await pc.engine.sync();
  assert.equal(pc.data.tasks[0].title, 'Call the caterer');
});

test('conflicting offline edits: the most recent edit wins on both devices', async () => {
  const email = uniqueEmail();
  const pc = device('pc');
  const phone = device('phone');
  const t = Model.saveTask(pc.data, { title: 'Draft agenda', dueDate: '2026-11-05' }, 1000);
  await pc.engine.signIn(email, 'secret123', true);
  await phone.engine.signIn(email, 'secret123');

  Model.saveTask(phone.data, { ...phone.data.tasks[0], title: 'Draft agenda (phone, later)' }, 8000);
  Model.saveTask(pc.data, { ...t, title: 'Draft agenda (pc, earlier)' }, 7000);
  await phone.engine.sync(); // later edit uploaded first
  await pc.engine.sync(); // older edit must not overwrite it
  await phone.engine.sync();
  assert.equal(pc.data.tasks[0].title, 'Draft agenda (phone, later)');
  assert.equal(phone.data.tasks[0].title, 'Draft agenda (phone, later)');

  Model.saveTask(pc.data, { ...pc.data.tasks[0], title: 'Final agenda (pc)' }, 9000);
  await pc.engine.sync();
  await phone.engine.sync();
  assert.equal(phone.data.tasks[0].title, 'Final agenda (pc)');
});

test('signing in merges data that was already on both devices', async () => {
  const email = uniqueEmail();
  const pc = device('pc');
  const phone = device('phone');
  Model.saveTask(pc.data, { title: 'From PC', dueDate: '2026-11-06' }, 1000);
  Model.saveTask(phone.data, { title: 'From phone', dueDate: '2026-11-06' }, 1000);
  await pc.engine.signIn(email, 'secret123', true);
  await phone.engine.signIn(email, 'secret123');
  await pc.engine.sync();
  assert.deepEqual(pc.data.tasks.map((t) => t.title).sort(), ['From PC', 'From phone']);
  assert.deepEqual(phone.data.tasks.map((t) => t.title).sort(), ['From PC', 'From phone']);
});

test('acknowledging or dismissing an alert on one device reaches the other', async () => {
  const email = uniqueEmail();
  const pc = device('pc');
  const phone = device('phone');
  await pc.engine.signIn(email, 'secret123', true);
  await phone.engine.signIn(email, 'secret123');
  Model.recordAlertAction(phone.data, 'm:abc:123', 'ack', 3000);
  Model.recordAlertAction(phone.data, 'm:def:456', 'dismiss', 3000);
  await phone.engine.sync();
  await pc.engine.sync();
  assert.equal(pc.data.alertActions['m:abc:123'].action, 'ack');
  assert.equal(pc.data.alertActions['m:def:456'].action, 'dismiss');
  assert.ok(pc.changes.some((c) => c.type === 'alerts' && c.id === 'm:abc:123'));
});

test('large lists sync completely (paged downloads)', async () => {
  const email = uniqueEmail();
  const pc = device('pc');
  const phone = device('phone');
  for (let i = 0; i < 650; i++) Model.saveTask(pc.data, { title: `Task ${i}`, dueDate: '2026-11-07' }, 1000 + i);
  await pc.engine.signIn(email, 'secret123', true);
  await phone.engine.signIn(email, 'secret123');
  assert.equal(phone.data.tasks.length, 650);
});

test('another account cannot read your data (security rules)', async () => {
  const pc = device('pc');
  await pc.engine.signIn(uniqueEmail(), 'secret123', true);
  Model.saveTask(pc.data, { title: 'Private', dueDate: '2026-11-08' }, 1000);
  await pc.engine.sync();
  const other = device('other');
  await other.engine.signIn(uniqueEmail(), 'secret123', true);
  const intruder = { ...other.session, uid: pc.session.uid }; // other person's token, your folder
  await assert.rejects(other.client.changedSince(intruder, null), /refused access/);
  const noToken = { ...other.session, idToken: 'not-a-token', uid: pc.session.uid };
  await assert.rejects(other.client.changedSince(noToken, null));
});

test('clear sign-in errors and token refresh', async () => {
  const email = uniqueEmail();
  const a = device('a');
  await a.engine.signIn(email, 'secret123', true);
  const b = device('b');
  await assert.rejects(b.engine.signIn(email, 'wrongpass'), /Wrong (email or )?password/);
  await assert.rejects(b.engine.signIn(email, 'secret123', true), /already exists/);
  await assert.rejects(b.engine.signIn(uniqueEmail(), '123', true), /at least 6 characters/);

  a.session = { ...a.session, idToken: 'expired', expiresAt: 0 }; // force a refresh
  Model.saveTask(a.data, { title: 'After refresh', dueDate: '2026-11-09' }, 2000);
  await a.engine.sync();
  assert.notEqual(a.session.idToken, 'expired');
  assert.equal(Object.keys(a.data.sync.dirty).length, 0);
  await a.client.sendPasswordReset(email);

  a.engine.signOut();
  assert.equal(a.session, null);
  assert.equal(a.data.tasks.length, 1, 'signing out keeps the data on this device');
});
