/*
 * Reminder engine. Pure logic over the stored data so it can be tested with a fake clock.
 *
 * Every reminder has a stable key built from the item id, its start/due instant and
 * the lead time, e.g. "m:<id>:<startUtc>:20". A key is recorded in `fired` the moment
 * it is announced or marked missed, so it can never be spoken twice. Editing or
 * rescheduling a meeting changes its start instant, which produces fresh keys, so the
 * reminders are recalculated automatically; cancelling removes them.
 *
 * Reminders whose time passed while the computer was asleep or the app was closed are
 * recorded as "missed" (shown in the app, never spoken). If several reminders for the
 * same meeting are due at once, only the most recent one can be spoken.
 *
 * Attention mode: an announcement flagged `attention` plays an alarm before the spoken
 * reminder, and repeats every `repeatSeconds` until it is acknowledged (or snoozed /
 * dismissed), the meeting ends, or the computer slept through the repeat time.
 */
const Tasks = require('../shared/tasks');

const MINUTE = 60 * 1000;
const MEETING_OFFSETS = [30, 20, 10, 5];
const GRACE_MS = 2 * MINUTE; // how late a reminder may still be spoken
const MISSED_RELEVANCE_MS = 24 * 60 * MINUTE; // older items are dropped silently
const FIRED_RETENTION_MS = 14 * 24 * 60 * MINUTE;
const TASK_REPEAT_WINDOW_MS = 60 * MINUTE; // task alerts stop repeating an hour after the due time
const TEST_INSTANCE = 'test:attention';

function meetingInstanceKey(m) { return `m:${m.id}:${m.startUtc}`; }
function taskInstanceKey(t, dueUtc) { return `t:${t.id}:${dueUtc}`; }

function minutesPhrase(n) { return n === 1 ? '1 minute' : `${n} minutes`; }

function meetingText(title, minutesLeft) {
  if (minutesLeft < 0) return `Reminder: ${title} started ${minutesPhrase(-minutesLeft)} ago.`;
  if (minutesLeft === 0) return `Reminder: ${title} is starting now.`;
  return `Reminder: ${title} starts in ${minutesPhrase(minutesLeft)}.`;
}

function taskText(title, minutesLeft) {
  if (minutesLeft < 0) return `Task reminder: ${title} was due ${minutesPhrase(-minutesLeft)} ago.`;
  if (minutesLeft === 0) return `Task reminder: ${title} is due now.`;
  return `Task reminder: ${title} is due in ${minutesPhrase(minutesLeft)}.`;
}

/** All reminder slots that exist for the current data (ignores fired state). */
function reminderSlots(data) {
  const slots = [];
  for (const m of data.meetings) {
    if (m.status === 'cancelled' || typeof m.startUtc !== 'number') continue;
    const inst = meetingInstanceKey(m);
    for (const off of MEETING_OFFSETS) {
      slots.push({
        key: `${inst}:${off}`, instance: inst, kind: 'meeting', refId: m.id,
        title: m.title, offset: off, dueAt: m.startUtc - off * MINUTE,
        startUtc: m.startUtc, endUtc: m.startUtc + (m.duration || 0) * MINUTE,
        armedAt: m.armedAt || 0, timeZone: m.timeZone,
      });
    }
  }
  for (const t of data.tasks) {
    if (t.completed || !t.speak || !t.dueTime) continue;
    const due = Tasks.dueTimestamp(t);
    const lead = Number(t.leadMinutes) || 0;
    const inst = taskInstanceKey(t, due);
    slots.push({
      key: `${inst}:${lead}`, instance: inst, kind: 'task', refId: t.id,
      title: t.title, offset: lead, dueAt: due - lead * MINUTE,
      startUtc: due, endUtc: due, armedAt: t.armedAt || 0,
    });
  }
  return slots;
}

function attentionSettings(data) {
  const s = data.settings || {};
  return {
    enabled: !!s.attentionEnabled,
    offsets: Array.isArray(s.attentionOffsets) ? s.attentionOffsets : MEETING_OFFSETS,
    tasks: s.attentionTasks !== false,
    repeatMs: Math.max(15, Number(s.repeatSeconds) || 60) * 1000,
  };
}

/** Whether this reminder should use attention mode (alarm + repeat until acknowledged). */
function wantsAttention(data, slot, reason) {
  const a = attentionSettings(data);
  if (!a.enabled) return false;
  if (slot.kind === 'task') return a.tasks;
  if (reason === 'snooze') return true;
  return a.offsets.includes(slot.offset);
}

function announcementFor(slot, now, reason) {
  const minutesLeft = Math.max(0, Math.round((slot.startUtc - now) / MINUTE));
  // Within the grace window, say the scheduled lead time ("20 minutes"), not 19.
  const spokenMinutes = reason === 'scheduled' ? slot.offset : minutesLeft;
  return {
    key: slot.key + (reason === 'snooze' ? `:snooze:${now}` : ''),
    instance: slot.instance, kind: slot.kind, refId: slot.refId, title: slot.title,
    startUtc: slot.startUtc, offset: slot.offset, reason, at: now,
    text: slot.kind === 'meeting' ? meetingText(slot.title, spokenMinutes) : taskText(slot.title, spokenMinutes),
    timeZone: slot.timeZone,
    attention: false,
  };
}

/** When an unacknowledged alert stops repeating on its own. */
function repeatUntilFor(slot) {
  return slot.kind === 'task' ? slot.startUtc + TASK_REPEAT_WINDOW_MS : slot.endUtc;
}

/**
 * Advance the reminder state to `now`. Mutates data.reminders.
 * Returns { announce: [...], missed: [...], changed: boolean }.
 * Announcements are ordered by meeting start so overlapping meetings queue sensibly.
 */
function evaluate(data, now) {
  const r = data.reminders;
  const slots = reminderSlots(data);
  const liveInstances = new Set(slots.map((s) => s.instance));
  const announce = [];
  const missed = [];
  let changed = false;

  // Group due, unfired slots by instance.
  const dueByInstance = new Map();
  for (const s of slots) {
    if (r.fired[s.key]) continue;
    if (s.dueAt > now) continue;
    if (s.dueAt < s.armedAt) continue; // lead time had already passed when the item was saved
    if (r.dismissed[s.instance]) { r.fired[s.key] = now; changed = true; continue; }
    if (!dueByInstance.has(s.instance)) dueByInstance.set(s.instance, []);
    dueByInstance.get(s.instance).push(s);
  }

  const announcedInstances = new Set();
  for (const [inst, list] of dueByInstance) {
    list.sort((a, b) => b.dueAt - a.dueAt); // most recent first
    list.forEach((s, i) => {
      r.fired[s.key] = now;
      changed = true;
      const late = now - s.dueAt;
      if (i === 0 && late <= GRACE_MS) {
        const a = announcementFor(s, now, 'scheduled');
        a.attention = wantsAttention(data, s, 'scheduled');
        announce.push(a);
        announcedInstances.add(inst);
      } else if (now - s.startUtc <= MISSED_RELEVANCE_MS) {
        const m = {
          key: s.key, instance: s.instance, kind: s.kind, refId: s.refId, title: s.title,
          offset: s.offset, dueAt: s.dueAt, startUtc: s.startUtc, detectedAt: now,
        };
        r.missed.push(m);
        missed.push(m);
        // An older on-screen reminder for this meeting is now out of date.
        if (!announcedInstances.has(inst)) r.active = r.active.filter((x) => x.instance !== inst);
      }
    });
  }

  // Snoozes.
  const keep = [];
  for (const sn of r.snoozes) {
    if (!liveInstances.has(sn.instance) || r.dismissed[sn.instance]) { changed = true; continue; }
    if (sn.at > now) {
      // A scheduled reminder for this meeting just played; drop a snooze that would repeat it.
      if (announcedInstances.has(sn.instance) && sn.at - now <= MINUTE) { changed = true; continue; }
      keep.push(sn); continue;
    }
    changed = true;
    const slot = slots.find((s) => s.instance === sn.instance);
    if (announcedInstances.has(sn.instance)) continue;
    if (now - sn.at <= GRACE_MS && now < slot.endUtc + MINUTE) {
      const a = announcementFor(slot, now, 'snooze');
      a.attention = wantsAttention(data, slot, 'snooze');
      announce.push(a);
      announcedInstances.add(sn.instance);
      // Don't repeat with a scheduled reminder that falls within the next minute.
      for (const s of slots) {
        if (s.instance === sn.instance && s.dueAt <= now + MINUTE && !r.fired[s.key]) r.fired[s.key] = now;
      }
    }
  }
  r.snoozes = keep;

  // Active (snooze/dismiss-able) reminders: one per instance, newest wins.
  for (const a of announce) {
    const slot = slots.find((s) => s.instance === a.instance);
    r.active = r.active.filter((x) => x.instance !== a.instance);
    r.active.push({
      instance: a.instance, kind: a.kind, refId: a.refId, title: a.title, startUtc: a.startUtc, text: a.text, at: now,
      needsAck: a.attention, lastAlertAt: now, repeatCount: 0, repeatUntil: repeatUntilFor(slot),
    });
  }
  const activeBefore = r.active.length;
  r.active = r.active.filter((x) => {
    if (x.kind === 'test') return now < x.expiresAt;
    const slot = slots.find((s) => s.instance === x.instance);
    return slot && !r.dismissed[x.instance] && now < slot.endUtc + 15 * MINUTE;
  });
  if (r.active.length !== activeBefore) changed = true;

  // Attention mode: repeat unacknowledged alerts.
  const att = attentionSettings(data);
  for (const x of r.active) {
    if (!x.needsAck || announcedInstances.has(x.instance)) continue;
    const interval = x.repeatMs || att.repeatMs;
    const next = x.lastAlertAt + interval;
    if (now < next) continue;
    changed = true;
    const stale = now - next > GRACE_MS; // asleep or app closed through the repeat time
    const tooMany = x.maxRepeats != null && x.repeatCount >= x.maxRepeats;
    if (!att.enabled && x.kind !== 'test') { x.needsAck = false; continue; }
    if (stale || tooMany || now >= x.repeatUntil) { x.needsAck = false; continue; }
    x.lastAlertAt = now;
    x.repeatCount += 1;
    const minutesLeft = Math.round((x.startUtc - now) / MINUTE);
    const text = x.kind === 'task' ? taskText(x.title, minutesLeft) : meetingText(x.title, minutesLeft);
    x.text = text;
    announce.push({
      key: `${x.instance}:repeat:${now}`, instance: x.instance, kind: x.kind, refId: x.refId, title: x.title,
      startUtc: x.startUtc, offset: null, reason: 'repeat', at: now, text, attention: true, repeat: x.repeatCount,
    });
  }

  // Housekeeping.
  const missedBefore = r.missed.length;
  r.missed = r.missed.filter((m) => liveInstances.has(m.instance) && now - m.startUtc <= MISSED_RELEVANCE_MS);
  if (r.missed.length !== missedBefore) changed = true;
  for (const [k, ts] of Object.entries(r.fired)) {
    if (now - ts > FIRED_RETENTION_MS) { delete r.fired[k]; changed = true; }
  }
  for (const [k, ts] of Object.entries(r.dismissed)) {
    if (now - ts > FIRED_RETENTION_MS) { delete r.dismissed[k]; changed = true; }
  }

  announce.sort((a, b) => a.startUtc - b.startUtc || a.at - b.at);
  return { announce, missed, changed };
}

/** Stop repeating the alarm for this alert; the banner and later scheduled reminders remain. */
function acknowledge(data, instance) {
  let n = 0;
  for (const x of data.reminders.active) {
    if ((instance == null || x.instance === instance) && x.needsAck) { x.needsAck = false; n++; }
  }
  return n;
}

/**
 * A practice alert for the "Test attention alert" button: alarm, voice, flashing window and
 * vibration, repeating every 20 seconds (at most 3 times) until acknowledged.
 */
function startTestAlert(data, now) {
  const r = data.reminders;
  r.active = r.active.filter((x) => x.instance !== TEST_INSTANCE);
  const startUtc = now + 20 * MINUTE;
  const title = 'Budget review with the Executive Director';
  const text = meetingText(title, 20);
  r.active.push({
    instance: TEST_INSTANCE, kind: 'test', refId: null, title, startUtc, text, at: now,
    needsAck: true, lastAlertAt: now, repeatCount: 0, repeatMs: 20 * 1000, maxRepeats: 3,
    repeatUntil: now + 5 * MINUTE, expiresAt: now + 5 * MINUTE,
  });
  return {
    key: `${TEST_INSTANCE}:${now}`, instance: TEST_INSTANCE, kind: 'test', refId: null, title, startUtc,
    offset: 20, reason: 'test', at: now, text, attention: true,
  };
}

function snooze(data, instance, minutes, now) {
  const r = data.reminders;
  r.snoozes = r.snoozes.filter((s) => s.instance !== instance);
  r.snoozes.push({ instance, at: now + minutes * MINUTE });
  r.active = r.active.filter((x) => x.instance !== instance);
}

/** Stop all remaining reminders for this meeting/task occurrence. */
function dismiss(data, instance, now) {
  const r = data.reminders;
  r.dismissed[instance] = now;
  r.snoozes = r.snoozes.filter((s) => s.instance !== instance);
  r.active = r.active.filter((x) => x.instance !== instance);
}

/** Next pending reminder per item, for display. */
function upcoming(data, now) {
  const r = data.reminders;
  const next = {};
  for (const s of reminderSlots(data)) {
    if (r.fired[s.key] || r.dismissed[s.instance] || s.dueAt <= now || s.dueAt < s.armedAt) continue;
    if (!next[s.refId] || s.dueAt < next[s.refId].dueAt) next[s.refId] = { dueAt: s.dueAt, offset: s.offset, kind: s.kind };
  }
  for (const sn of r.snoozes) {
    const id = sn.instance.split(':')[1];
    if (!next[id] || sn.at < next[id].dueAt) next[id] = { dueAt: sn.at, snoozed: true };
  }
  return next;
}

/** Earliest future time the engine needs to run again (for precise wake-ups). */
function nextDueAt(data, now) {
  let best = Infinity;
  for (const v of Object.values(upcoming(data, now))) best = Math.min(best, v.dueAt);
  return best;
}

module.exports = {
  MEETING_OFFSETS, GRACE_MS, MINUTE, TEST_INSTANCE, evaluate, snooze, dismiss, acknowledge, startTestAlert, upcoming, nextDueAt,
  reminderSlots, meetingText, taskText, meetingInstanceKey,
};
