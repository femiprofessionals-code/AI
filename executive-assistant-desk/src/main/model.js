/*
 * Validation and mutation of meetings and tasks (pure, testable; also bundled into the
 * Android app). Every change is recorded in data.sync so it can be uploaded to the
 * other device; deletions leave a tombstone so they reach the other device too.
 */
const TZ = require('../shared/tz');

const ZONE_IDS = TZ.ZONES.map((z) => z.id);

function newId() { return globalThis.crypto.randomUUID(); }

/** Mark a record as changed locally so the next sync uploads it. */
function touch(data, type, id) {
  if (data.sync) data.sync.dirty[`${type}/${id}`] = true;
}

function tombstone(data, type, id, now) {
  if (!data.sync) return;
  data.sync.tombstones[`${type}/${id}`] = now;
  data.sync.dirty[`${type}/${id}`] = true;
}

function cleanText(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

function cleanLink(v) {
  const s = cleanText(v, 2000);
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : 'https://' + s;
  let u;
  try { u = new URL(withScheme); } catch (_) { throw new Error('The meeting link is not a valid web address.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('The meeting link must start with http:// or https://');
  return u.toString();
}

/**
 * Create or update a meeting. Returns { meeting, warning }.
 * Changing date/time/zone resets reminder arming so past lead times are not announced.
 */
function saveMeeting(data, input, now) {
  const title = cleanText(input.title, 200);
  if (!title) throw new Error('Please enter a meeting title.');
  if (!ZONE_IDS.includes(input.timeZone)) throw new Error('Please choose a time zone.');
  if (!TZ.parseDate(input.date)) throw new Error('Please enter a valid date.');
  if (!TZ.parseTime(input.time)) throw new Error('Please enter a valid start time.');
  const duration = Math.round(Number(input.duration));
  if (!Number.isFinite(duration) || duration < 5 || duration > 24 * 60) throw new Error('Duration must be between 5 minutes and 24 hours.');

  const conv = TZ.zonedToUtc(input.date, input.time, input.timeZone);
  let warning = '';
  let time = input.time;
  if (conv.nonexistent) {
    time = TZ.timeIn(conv.utc, input.timeZone);
    warning = `${input.time} does not exist on ${input.date} in ${TZ.zoneLabel(input.timeZone)} because clocks move forward for daylight saving time. The meeting was set to ${time}.`;
  } else if (conv.ambiguous) {
    warning = `${input.time} happens twice on ${input.date} in ${TZ.zoneLabel(input.timeZone)} because clocks move back. The first occurrence (daylight time) was used.`;
  }

  const fields = {
    title, date: input.date, time, timeZone: input.timeZone, duration,
    notes: cleanText(input.notes, 5000), link: cleanLink(input.link), startUtc: conv.utc,
  };

  let meeting = input.id ? data.meetings.find((m) => m.id === input.id) : null;
  if (input.id && !meeting) throw new Error('That meeting no longer exists.');
  if (meeting) {
    if (meeting.startUtc !== fields.startUtc) {
      meeting.history = meeting.history || [];
      meeting.history.push({ from: { date: meeting.date, time: meeting.time, timeZone: meeting.timeZone }, at: now });
      meeting.armedAt = now;
    }
    Object.assign(meeting, fields, { status: 'scheduled', updatedAt: now });
  } else {
    meeting = { id: newId(), ...fields, status: 'scheduled', createdAt: now, updatedAt: now, armedAt: now, history: [] };
    data.meetings.push(meeting);
  }
  touch(data, 'meetings', meeting.id);
  return { meeting, warning };
}

function setMeetingStatus(data, id, status, now) {
  const m = data.meetings.find((x) => x.id === id);
  if (!m) throw new Error('That meeting no longer exists.');
  if (status === 'scheduled' && m.status === 'cancelled') m.armedAt = now; // restoring: don't replay old lead times
  m.status = status;
  m.updatedAt = now;
  touch(data, 'meetings', id);
  return m;
}

function deleteMeeting(data, id, now) {
  data.meetings = data.meetings.filter((m) => m.id !== id);
  tombstone(data, 'meetings', id, now || Date.now());
}

function saveTask(data, input, now) {
  const title = cleanText(input.title, 300);
  if (!title) throw new Error('Please enter a task.');
  if (!TZ.parseDate(input.dueDate)) throw new Error('Please enter a valid due date.');
  if (input.dueTime && !TZ.parseTime(input.dueTime)) throw new Error('Please enter a valid due time.');
  const priority = ['high', 'medium', 'low'].includes(input.priority) ? input.priority : 'medium';
  const speak = !!input.speak && !!input.dueTime;
  const leadMinutes = [0, 5, 10, 15, 30, 60].includes(Number(input.leadMinutes)) ? Number(input.leadMinutes) : 0;
  const fields = {
    title, dueDate: input.dueDate, dueTime: input.dueTime || '', priority,
    notes: cleanText(input.notes, 5000), speak, leadMinutes,
  };
  let task = input.id ? data.tasks.find((t) => t.id === input.id) : null;
  if (input.id && !task) throw new Error('That task no longer exists.');
  if (task) {
    const timingChanged = task.dueDate !== fields.dueDate || task.dueTime !== fields.dueTime || task.leadMinutes !== fields.leadMinutes || task.speak !== fields.speak;
    Object.assign(task, fields, { updatedAt: now });
    if (timingChanged) task.armedAt = now;
  } else {
    task = { id: newId(), ...fields, completed: false, completedAt: null, createdAt: now, updatedAt: now, armedAt: now };
    data.tasks.push(task);
  }
  touch(data, 'tasks', task.id);
  return task;
}

function setTaskCompleted(data, id, completed, now) {
  const t = data.tasks.find((x) => x.id === id);
  if (!t) throw new Error('That task no longer exists.');
  t.completed = !!completed;
  t.completedAt = completed ? now : null;
  if (!completed) t.armedAt = now; // reopened: only future reminders apply
  t.updatedAt = now;
  touch(data, 'tasks', id);
  return t;
}

function deleteTask(data, id, now) {
  data.tasks = data.tasks.filter((t) => t.id !== id);
  tombstone(data, 'tasks', id, now || Date.now());
}

/**
 * Remember that an alert was acknowledged ('ack') or dismissed ('dismiss') so the
 * other device stops it too. Snoozing counts as acknowledging the current alert.
 */
function recordAlertAction(data, instance, action, now) {
  if (!instance || instance.startsWith('test:')) return;
  const prev = data.alertActions[instance];
  if (prev && prev.action === 'dismiss' && action === 'ack') return; // dismiss already covers it
  data.alertActions[instance] = { action, at: now, updatedAt: now };
  touch(data, 'alerts', instance);
}

module.exports = {
  saveMeeting, setMeetingStatus, deleteMeeting, saveTask, setTaskCompleted, deleteTask, recordAlertAction, cleanLink, touch,
};
