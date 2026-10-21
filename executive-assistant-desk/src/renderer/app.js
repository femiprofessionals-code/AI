/* global TZ, Tasks, SpeechQueue */
(function () {
  const desk = window.desk;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const MINUTE = 60000;
  const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

  let S = null; // latest state from the main process
  const now = () => Date.now() + (S ? S.clockOffset : 0);
  const speech = new SpeechQueue(() => (S ? S.settings : { muted: false, volume: 1, rate: 1 }));
  window.__speech = speech; // exposed for the automated tests

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + (kind || '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.className = 'toast'; }, kind === 'warn' ? 9000 : 3500);
  }

  async function act(fn, okMsg) {
    try {
      const v = await fn();
      if (okMsg) toast(okMsg);
      return v;
    } catch (e) {
      toast(e.message, 'error');
      throw e;
    }
  }

  function confirmBox(text, yesLabel) {
    return new Promise((resolve) => {
      const d = $('#confirm-dialog');
      $('#confirm-text').textContent = text;
      $('#confirm-yes').textContent = yesLabel || 'Yes';
      d.returnValue = '';
      d.addEventListener('close', () => resolve(d.returnValue === 'yes'), { once: true });
      d.showModal();
    });
  }

  function durationText(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return [h ? `${h} hour${h > 1 ? 's' : ''}` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
  }

  function relative(ms) {
    const abs = Math.abs(ms);
    const mins = Math.round(abs / MINUTE);
    let s;
    if (mins < 1) s = 'less than a minute';
    else if (mins < 60) s = `${mins} min`;
    else if (mins < 48 * 60) s = `${Math.floor(mins / 60)} h ${mins % 60 ? (mins % 60) + ' min' : ''}`.trim();
    else s = `${Math.round(mins / 1440)} days`;
    return ms >= 0 ? `in ${s}` : `${s} ago`;
  }

  /* ---------------- Clocks ---------------- */
  function buildClocks() {
    $('#clocks').innerHTML = TZ.ZONES.map((z) => `
      <div class="clock" data-zone="${z.id}">
        <div class="clock-label">${esc(z.label)}${z.id === LOCAL_ZONE ? ' <span class="chip">This computer</span>' : ''}</div>
        <div class="clock-time" data-part="time"></div>
        <div class="clock-date" data-part="date"></div>
        <div class="clock-meta" data-part="meta"></div>
      </div>`).join('');
  }

  function tickClocks() {
    const t = now();
    const localDate = TZ.dateIn(t, LOCAL_ZONE);
    for (const el of $$('.clock')) {
      const zone = el.dataset.zone;
      $('[data-part=time]', el).textContent = TZ.formatTime12(t, zone, true);
      const shift = TZ.dayDiff(localDate, TZ.dateIn(t, zone));
      $('[data-part=date]', el).innerHTML = esc(TZ.formatDateLong(t, zone)) +
        (shift ? ` <span class="badge daydiff">${esc(TZ.dayShiftLabel(shift))}</span>` : '');
      const dst = TZ.isDst(t, zone);
      const observes = TZ.offsetMinutes(Date.UTC(new Date(t).getUTCFullYear(), 0, 1), zone) !== TZ.offsetMinutes(Date.UTC(new Date(t).getUTCFullYear(), 6, 1), zone);
      $('[data-part=meta]', el).textContent = `${TZ.abbreviation(t, zone)} · ${TZ.formatOffset(TZ.offsetMinutes(t, zone))} · ${observes ? (dst ? 'Daylight saving time' : 'Standard time') : 'No daylight saving'}`;
    }
  }

  /* ---------------- Meetings ---------------- */
  function meetingPhase(m, t) {
    if (m.status === 'cancelled') return 'cancelled';
    const end = m.startUtc + m.duration * MINUTE;
    if (t >= end) return 'ended';
    if (t >= m.startUtc) return 'live';
    return 'upcoming';
  }

  function equivalentsHtml(startUtc, zone, duration) {
    const eq = TZ.equivalents(startUtc, zone);
    const endEq = TZ.equivalents(startUtc + duration * MINUTE, zone);
    return `<div class="equivs">${eq.map((e, i) => `
      <div class="equiv ${e.isOrigin ? 'origin' : ''} ${e.dayShift ? 'shifted' : ''}">
        <div class="equiv-zone">${esc(e.label)}${e.isOrigin ? ' <span class="chip">Set in</span>' : ''}</div>
        <div class="equiv-time">${esc(e.time12)} – ${esc(endEq[i].time12)} <span class="muted">${esc(e.abbr)}</span></div>
        <div class="equiv-date">${esc(e.dateShort)}${e.dayShift ? ` <span class="badge daydiff">${esc(TZ.dayShiftLabel(e.dayShift))}</span>` : ''}</div>
      </div>`).join('')}</div>`;
  }

  function meetingCard(m, opts = {}) {
    const t = now();
    const phase = meetingPhase(m, t);
    const badges = [];
    if (phase === 'cancelled') badges.push('<span class="badge cancelled">Cancelled</span>');
    if (phase === 'live') badges.push('<span class="badge live">In progress</span>');
    if (phase === 'ended') badges.push('<span class="badge ended">Ended</span>');
    if (m.history && m.history.length) badges.push('<span class="badge info">Rescheduled</span>');
    const up = S.upcoming[m.id];
    let next = '';
    if (phase === 'upcoming') {
      next = `<span>Starts ${esc(relative(m.startUtc - t))}</span>`;
      if (up) next += ` · <span>${up.snoozed ? 'Snoozed reminder' : `Next reminder (${up.offset} min before)`} ${esc(relative(up.dueAt - t))}</span>`;
      else next += ' · <span>No more reminders</span>';
    }
    const actions = [];
    if (m.link && phase !== 'cancelled') actions.push(`<button class="btn small primary" data-act="join" data-id="${m.id}">Join</button>`);
    if (phase !== 'cancelled') {
      actions.push(`<button class="btn small" data-act="edit-meeting" data-id="${m.id}">Edit</button>`);
      actions.push(`<button class="btn small" data-act="reschedule" data-id="${m.id}">Reschedule</button>`);
      actions.push(`<button class="btn small warn" data-act="cancel-meeting" data-id="${m.id}">Cancel meeting</button>`);
    } else {
      actions.push(`<button class="btn small" data-act="restore-meeting" data-id="${m.id}">Restore</button>`);
    }
    if (phase === 'cancelled' || phase === 'ended') actions.push(`<button class="btn small danger" data-act="delete-meeting" data-id="${m.id}">Delete</button>`);
    return `
      <article class="card meeting ${phase}" data-meeting="${m.id}">
        <div class="card-head">
          <h3>${esc(m.title)}</h3>
          <div class="badges">${badges.join('')}</div>
        </div>
        <div class="card-sub">${esc(TZ.formatDateLong(m.startUtc, m.timeZone))} · ${esc(durationText(m.duration))} · set in ${esc(TZ.zoneLabel(m.timeZone))}</div>
        ${equivalentsHtml(m.startUtc, m.timeZone, m.duration)}
        ${next ? `<div class="card-next">${next}</div>` : ''}
        ${m.notes && !opts.compact ? `<div class="notes">${esc(m.notes)}</div>` : ''}
        ${m.notes && opts.compact ? `<details class="notes-toggle"><summary>Notes</summary><div class="notes">${esc(m.notes)}</div></details>` : ''}
        <div class="card-actions">${actions.join('')}</div>
      </article>`;
  }

  function renderMeetings() {
    const t = now();
    const today = TZ.dateIn(t, LOCAL_ZONE);
    $('#today-label').textContent = '— ' + TZ.formatDateLong(t, LOCAL_ZONE);
    const sorted = S.meetings.slice().sort((a, b) => a.startUtc - b.startUtc);
    const todays = sorted.filter((m) => TZ.dateIn(m.startUtc, LOCAL_ZONE) === today);
    $('#today-meetings').innerHTML = todays.length
      ? todays.map((m) => meetingCard(m, { compact: true })).join('')
      : '<p class="empty">No meetings today.</p>';
    const later = sorted.filter((m) => m.status !== 'cancelled' && TZ.dateIn(m.startUtc, LOCAL_ZONE) > today).slice(0, 3);
    $('#next-meetings-head').hidden = !later.length;
    $('#next-meetings').innerHTML = later.map((m) => meetingCard(m, { compact: true })).join('');

    const filter = $('#meeting-filter').value;
    let list = sorted;
    if (filter === 'upcoming') list = sorted.filter((m) => m.status !== 'cancelled' && m.startUtc + m.duration * MINUTE > t);
    if (filter === 'past') list = sorted.filter((m) => m.status !== 'cancelled' && m.startUtc + m.duration * MINUTE <= t).reverse();
    if (filter === 'cancelled') list = sorted.filter((m) => m.status === 'cancelled');
    $('#meetings-list').innerHTML = list.length ? list.map((m) => meetingCard(m)).join('') : '<p class="empty">Nothing to show.</p>';
  }

  /* ---------------- Tasks ---------------- */
  function taskDueText(task) {
    const [y, mo, d] = task.dueDate.split('-').map(Number);
    const dateTxt = new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!task.dueTime) return dateTxt;
    const [h, mi] = task.dueTime.split(':').map(Number);
    return dateTxt + ', ' + new Date(2000, 0, 1, h, mi).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function taskRow(task) {
    const st = Tasks.status(task, now());
    const label = { overdue: 'Overdue', today: 'Due today', upcoming: 'Upcoming', completed: 'Done' }[st];
    const completedTxt = task.completed && task.completedAt ? ` · completed ${new Date(task.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '';
    return `
      <div class="task ${st} prio-${task.priority}" data-task="${task.id}">
        <label class="task-check" title="${task.completed ? 'Mark as not done' : 'Mark as done'}">
          <input type="checkbox" data-act="toggle-task" data-id="${task.id}" ${task.completed ? 'checked' : ''} aria-label="Complete ${esc(task.title)}">
        </label>
        <div class="task-body">
          <div class="task-title">${esc(task.title)}</div>
          <div class="task-meta">
            <span class="badge st-${st}">${label}</span>
            <span class="badge prio">${esc(task.priority[0].toUpperCase() + task.priority.slice(1))} priority</span>
            <span>Due ${esc(taskDueText(task))}${esc(completedTxt)}</span>
            ${task.speak && !task.completed ? `<span title="Spoken reminder">🔔 ${task.leadMinutes ? task.leadMinutes + ' min before' : 'at due time'}</span>` : ''}
          </div>
          ${task.notes ? `<div class="notes">${esc(task.notes)}</div>` : ''}
        </div>
        <div class="task-actions">
          ${task.completed ? `<button class="btn small" data-act="reopen-task" data-id="${task.id}">Reopen</button>` : ''}
          <button class="btn small" data-act="edit-task" data-id="${task.id}">Edit</button>
          <button class="btn small danger" data-act="delete-task" data-id="${task.id}">Delete</button>
        </div>
      </div>`;
  }

  function taskSection(title, cls, tasks, emptyMsg) {
    if (!tasks.length && !emptyMsg) return '';
    return `<div class="task-section ${cls}"><h3>${esc(title)} <span class="count">${tasks.length}</span></h3>
      ${tasks.length ? tasks.map(taskRow).join('') : `<p class="empty">${esc(emptyMsg)}</p>`}</div>`;
  }

  function renderTasks() {
    const t = now();
    const g = Tasks.group(S.tasks, t);
    const today = Tasks.localDateStr(t);
    const doneToday = g.completed.filter((x) => x.completedAt && Tasks.localDateStr(x.completedAt) === today);
    const totalToday = g.overdue.length + g.today.length + doneToday.length;
    $('#today-tasks').innerHTML =
      `<div class="progress"><div class="progress-text">${doneToday.length} of ${totalToday} done today</div>
        <div class="bar"><div class="bar-fill" data-pct="${totalToday ? Math.round(100 * doneToday.length / totalToday) : 0}"></div></div></div>` +
      taskSection('Overdue', 'overdue', g.overdue) +
      taskSection('Due today', 'today', g.today, g.overdue.length ? '' : 'Nothing else due today.') +
      taskSection('Completed today', 'completed', doneToday) +
      (g.upcoming.length ? `<p class="muted">${g.upcoming.length} upcoming task${g.upcoming.length > 1 ? 's' : ''} — see the Tasks tab.</p>` : '');
    for (const f of $$('.bar-fill')) f.style.width = f.dataset.pct + '%';

    $('#tasks-all').innerHTML =
      taskSection('Overdue', 'overdue', g.overdue, 'No overdue tasks.') +
      taskSection('Due today', 'today', g.today, 'Nothing due today.') +
      taskSection('Upcoming', 'upcoming', g.upcoming, 'No upcoming tasks.') +
      taskSection('Completed', 'completed', g.completed, 'No completed tasks yet.');
  }

  /* ---------------- Alerts (active + missed reminders) ---------------- */
  function renderAlerts() {
    const active = S.reminders.active.slice().sort((a, b) => a.startUtc - b.startUtc);
    const missed = S.reminders.missed;
    const byInst = new Map();
    for (const m of missed) {
      if (!byInst.has(m.instance)) byInst.set(m.instance, { ...m, offsets: [] });
      byInst.get(m.instance).offsets.push(m.offset);
    }
    const snooze = S.settings.snoozeMinutes;
    let html = '';
    for (const a of active) {
      const meeting = a.kind === 'meeting' ? S.meetings.find((m) => m.id === a.refId) : null;
      html += `<div class="alert active-alert ${a.needsAck ? 'needs-ack' : ''} ${a.needsAck && S.settings.flashing ? 'flash' : ''}" data-instance="${esc(a.instance)}">
        <div class="alert-icon">🔔</div>
        <div class="alert-body"><strong>${a.kind === 'task' ? 'Task reminder' : a.kind === 'test' ? 'Test alert' : 'Reminder'}: ${esc(a.title)}</strong>
          <div class="muted">${a.kind === 'meeting' ? (a.startUtc > now() ? 'Starts' : 'Started') : 'Due'} ${esc(relative(a.startUtc - now()))}</div></div>
        <div class="alert-actions">
          ${a.needsAck ? `<button class="btn ack" data-act="acknowledge" data-instance="${esc(a.instance)}">Acknowledge</button>` : ''}
          ${meeting && meeting.link ? `<button class="btn small primary" data-act="join" data-id="${meeting.id}">Join</button>` : ''}
          <button class="btn small" data-act="snooze" data-instance="${esc(a.instance)}">Snooze ${snooze} min</button>
          <button class="btn small" data-act="dismiss" data-instance="${esc(a.instance)}">Dismiss</button>
        </div></div>`;
    }
    for (const m of byInst.values()) {
      const offs = m.offsets.sort((a, b) => b - a).map((o) => (o ? `${o}-minute` : 'due-time')).join(', ');
      const when = m.kind === 'meeting'
        ? `${TZ.formatTime12(m.startUtc, LOCAL_ZONE)} ${TZ.abbreviation(m.startUtc, LOCAL_ZONE)}, ${TZ.formatDateShort(m.startUtc, LOCAL_ZONE)}`
        : new Date(m.startUtc).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      html += `<div class="alert missed-alert">
        <div class="alert-icon">⏰</div>
        <div class="alert-body"><strong>Missed while away: ${esc(m.title)}</strong>
          <div class="muted">${esc(offs)} reminder${m.offsets.length > 1 ? 's' : ''} · ${m.kind === 'meeting' ? 'meeting at' : 'due'} ${esc(when)} (${esc(relative(m.startUtc - now()))})</div></div>
        <div class="alert-actions"><button class="btn small" data-act="clear-missed" data-instance="${esc(m.instance)}">OK</button></div>
      </div>`;
    }
    if (byInst.size > 1) html += '<div class="alerts-foot"><button class="btn small" data-act="clear-missed-all">Clear all missed</button></div>';
    $('#alerts').innerHTML = html;
  }

  /* ---------------- Settings ---------------- */
  function renderVoices() {
    const sel = $('#set-voice');
    const s = S ? S.settings : {};
    const fill = (names) => {
      sel.innerHTML = '<option value="">System default voice</option>' +
        names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
      sel.value = names.includes(s.voiceName) ? s.voiceName : '';
    };
    if (s.speechEngine === 'windows') {
      desk.nativeVoices().then(fill).catch(() => fill([]));
    } else {
      const voices = speech.voices.slice().sort((a, b) => (b.lang.startsWith('en') - a.lang.startsWith('en')) || a.name.localeCompare(b.name));
      fill(voices.map((v) => v.name));
      $('#voice-status').textContent = voices.length ? '' : 'No voices found yet. Try “Windows speech” if this stays empty.';
    }
  }

  function renderSettings() {
    const s = S.settings;
    $('#set-engine').value = s.speechEngine;
    $('#set-volume').value = s.volume;
    $('#out-volume').textContent = Math.round(s.volume * 100) + '%';
    $('#set-rate').value = s.rate;
    $('#out-rate').textContent = s.rate.toFixed(1) + '×';
    $('#set-muted').checked = s.muted;
    $('#set-snooze').value = String(s.snoozeMinutes);
    $('#set-notifications').checked = s.notifications;
    $('#set-login').checked = s.openAtLogin;
    $('#set-hidden').checked = s.startHidden;
    $('#login-note').textContent = S.isPackaged ? '' : 'Note: automatic start only takes effect in the installed app, not in development mode.';
    $('#about').textContent = `Version ${S.version}. Your data is saved on this computer only.`;
    const mute = $('#btn-mute');
    mute.textContent = s.muted ? '🔇 Muted' : '🔊 Voice on';
    mute.classList.toggle('muted-on', s.muted);
    if (document.activeElement !== $('#set-voice')) renderVoices();

    $('#set-attention').checked = s.attentionEnabled;
    $('#attention-options').classList.toggle('disabled', !s.attentionEnabled);
    for (const cb of $$('#set-att-offsets input')) cb.checked = s.attentionOffsets.includes(Number(cb.value));
    $('#set-att-tasks').checked = s.attentionTasks;
    $('#set-repeat').value = String(s.repeatSeconds);
    $('#set-flashing').checked = s.flashing;
    $('#set-alarm-sound').value = s.alarmSound;
    $('#set-alarm-volume').value = s.alarmVolume;
    $('#out-alarm-volume').textContent = Math.round(s.alarmVolume * 100) + '%';
    $('#set-alarm-seconds').value = String(s.alarmSeconds);
    $('#set-gamepad').checked = s.vibrateGamepad;
    $('#set-webhook').checked = s.webhookEnabled;
    $('#set-webhook-type').value = s.webhookType;
    if (document.activeElement !== $('#set-webhook-url')) $('#set-webhook-url').value = s.webhookUrl;
    renderGamepadStatus();
  }

  function renderGamepadStatus() {
    const pads = window.Vibrate.controllers();
    const vib = pads.filter((p) => p.canVibrate);
    $('#gamepad-status').textContent = !pads.length
      ? 'No controller detected. Connect it, then press any button on it once.'
      : vib.length ? `Ready: ${vib.map((p) => p.name.replace(/\s*\(.*$/, '')).join(', ')}` : 'Controller found, but it does not support vibration.';
  }

  function renderAll() {
    if (!S) return;
    tickClocks();
    renderAlerts();
    renderMeetings();
    renderTasks();
    renderSettings();
  }

  /* ---------------- Meeting dialog ---------------- */
  function defaultZone() {
    let z = null;
    try { z = localStorage.getItem('lastZone'); } catch (_) { /* ignore */ }
    if (TZ.ZONES.some((x) => x.id === z)) return z;
    return TZ.ZONES.some((x) => x.id === LOCAL_ZONE) ? LOCAL_ZONE : 'Africa/Lagos';
  }

  function openMeetingDialog(meeting, mode) {
    const f = $('#meeting-form');
    f.reset();
    $('#meeting-error').textContent = '';
    $('#meeting-zone').innerHTML = TZ.ZONES.map((z) => `<option value="${z.id}">${esc(z.label)} (${esc(z.id)})</option>`).join('');
    if (meeting) {
      f.id.value = meeting.id;
      f.title.value = meeting.title;
      f.date.value = meeting.date;
      f.time.value = meeting.time;
      f.duration.value = String(meeting.duration);
      if (f.duration.value !== String(meeting.duration)) {
        f.duration.insertAdjacentHTML('beforeend', `<option value="${meeting.duration}">${esc(durationText(meeting.duration))}</option>`);
        f.duration.value = String(meeting.duration);
      }
      f.timeZone.value = meeting.timeZone;
      f.link.value = meeting.link || '';
      f.notes.value = meeting.notes || '';
    } else {
      const zone = defaultZone();
      const t = now() + 30 * MINUTE;
      const rounded = Math.ceil(t / (30 * MINUTE)) * 30 * MINUTE;
      f.id.value = '';
      f.timeZone.value = zone;
      f.date.value = TZ.dateIn(rounded, zone);
      f.time.value = TZ.timeIn(rounded, zone);
      f.duration.value = '60';
    }
    $('#meeting-dialog-title').textContent = mode === 'reschedule' ? 'Reschedule meeting' : meeting ? 'Edit meeting' : 'Add meeting';
    $('#meeting-submit').textContent = mode === 'reschedule' ? 'Reschedule' : 'Save meeting';
    $('#meeting-dialog').dataset.original = meeting && mode === 'reschedule'
      ? `Currently: ${TZ.formatDateShort(meeting.startUtc, meeting.timeZone)}, ${TZ.formatTime12(meeting.startUtc, meeting.timeZone)} ${TZ.zoneLabel(meeting.timeZone)}` : '';
    updateMeetingPreview();
    $('#meeting-dialog').showModal();
    (mode === 'reschedule' ? f.date : f.title).focus();
  }

  function updateMeetingPreview() {
    const f = $('#meeting-form');
    const box = $('#meeting-preview');
    const original = $('#meeting-dialog').dataset.original;
    if (!TZ.parseDate(f.date.value) || !TZ.parseTime(f.time.value)) {
      box.innerHTML = '<p class="muted">Enter a date and time to see it in all three locations.</p>';
      return;
    }
    const conv = TZ.zonedToUtc(f.date.value, f.time.value, f.timeZone.value);
    let warn = '';
    if (conv.nonexistent) warn = `<p class="warn-text">⚠ ${esc(f.time.value)} does not exist on this date in ${esc(TZ.zoneLabel(f.timeZone.value))} (clocks spring forward). It will be saved as ${esc(TZ.timeIn(conv.utc, f.timeZone.value))}.</p>`;
    if (conv.ambiguous) warn = `<p class="warn-text">⚠ ${esc(f.time.value)} happens twice on this date in ${esc(TZ.zoneLabel(f.timeZone.value))} (clocks fall back). The first occurrence will be used.</p>`;
    const anyShift = TZ.equivalents(conv.utc, f.timeZone.value).some((e) => e.dayShift);
    box.innerHTML = (original ? `<p class="muted">${esc(original)}</p>` : '') +
      '<div class="preview-title">Equivalent times</div>' +
      equivalentsHtml(conv.utc, f.timeZone.value, Number(f.duration.value) || 60) +
      (anyShift ? '<p class="warn-text">The date is different in at least one location — see the highlighted entry.</p>' : '') + warn;
  }

  async function submitMeeting(e) {
    e.preventDefault();
    const f = $('#meeting-form');
    const input = {
      id: f.id.value || undefined, title: f.title.value, date: f.date.value, time: f.time.value,
      duration: Number(f.duration.value), timeZone: f.timeZone.value, link: f.link.value, notes: f.notes.value,
    };
    try {
      const res = await desk.saveMeeting(input);
      try { localStorage.setItem('lastZone', input.timeZone); } catch (_) { /* ignore */ }
      $('#meeting-dialog').close();
      if (res.warning) toast(res.warning, 'warn');
      else toast(input.id ? 'Meeting updated. Reminders recalculated.' : 'Meeting added. Reminders scheduled.');
    } catch (err) {
      $('#meeting-error').textContent = err.message;
    }
  }

  /* ---------------- Task dialog ---------------- */
  function openTaskDialog(task) {
    const f = $('#task-form');
    f.reset();
    $('#task-error').textContent = '';
    if (task) {
      f.id.value = task.id;
      f.title.value = task.title;
      f.dueDate.value = task.dueDate;
      f.dueTime.value = task.dueTime || '';
      f.priority.value = task.priority;
      f.speak.checked = task.speak;
      f.leadMinutes.value = String(task.leadMinutes || 0);
      f.notes.value = task.notes || '';
    } else {
      f.id.value = '';
      f.dueDate.value = Tasks.localDateStr(now());
      f.priority.value = 'medium';
    }
    $('#task-dialog-title').textContent = task ? 'Edit task' : 'Add task';
    updateTaskSpeak();
    $('#task-dialog').showModal();
    f.title.focus();
  }

  function updateTaskSpeak() {
    const f = $('#task-form');
    const hasTime = !!f.dueTime.value;
    f.speak.disabled = !hasTime;
    if (!hasTime) f.speak.checked = false;
    f.leadMinutes.disabled = !hasTime || !f.speak.checked;
    $('#task-speak-note').hidden = hasTime;
  }

  async function submitTask(e) {
    e.preventDefault();
    const f = $('#task-form');
    const input = {
      id: f.id.value || undefined, title: f.title.value, dueDate: f.dueDate.value, dueTime: f.dueTime.value,
      priority: f.priority.value, notes: f.notes.value, speak: f.speak.checked, leadMinutes: Number(f.leadMinutes.value),
    };
    try {
      await desk.saveTask(input);
      $('#task-dialog').close();
      toast(input.id ? 'Task updated.' : 'Task added.');
    } catch (err) {
      $('#task-error').textContent = err.message;
    }
  }

  /* ---------------- Navigation & events ---------------- */
  function showView(name) {
    for (const t of $$('.tab')) t.classList.toggle('active', t.dataset.view === name);
    for (const v of $$('.view')) v.classList.toggle('active', v.id === 'view-' + name);
  }

  function handleFocus(target) {
    if (target === 'add-meeting') openMeetingDialog(null);
    else if (target === 'add-task') openTaskDialog(null);
    else if (target === 'alerts') { showView('dashboard'); $('#alerts').scrollIntoView({ behavior: 'smooth' }); }
  }

  async function onClick(e) {
    const el = e.target.closest('[data-act], [data-action], [data-view]');
    if (!el) return;
    if (el.dataset.view && el.classList.contains('tab')) return showView(el.dataset.view);
    if (el.dataset.action) return handleFocus(el.dataset.action);
    const id = el.dataset.id;
    const meeting = id && S.meetings.find((m) => m.id === id);
    const task = id && S.tasks.find((t) => t.id === id);
    switch (el.dataset.act) {
      case 'join': if (meeting) desk.openLink(meeting.link); break;
      case 'edit-meeting': openMeetingDialog(meeting, 'edit'); break;
      case 'reschedule': openMeetingDialog(meeting, 'reschedule'); break;
      case 'cancel-meeting':
        if (await confirmBox(`Cancel “${meeting.title}”? Its reminders will stop.`, 'Cancel meeting')) {
          await act(() => desk.setMeetingStatus(id, 'cancelled'), 'Meeting cancelled. Reminders removed.');
        }
        break;
      case 'restore-meeting': await act(() => desk.setMeetingStatus(id, 'scheduled'), 'Meeting restored.'); break;
      case 'delete-meeting':
        if (await confirmBox(`Delete “${meeting.title}” permanently?`, 'Delete')) await act(() => desk.deleteMeeting(id), 'Meeting deleted.');
        break;
      case 'edit-task': openTaskDialog(task); break;
      case 'reopen-task': await act(() => desk.completeTask(id, false), 'Task reopened.'); break;
      case 'delete-task':
        if (await confirmBox(`Delete task “${task.title}”?`, 'Delete')) await act(() => desk.deleteTask(id), 'Task deleted.');
        break;
      case 'acknowledge': await act(() => desk.acknowledge(el.dataset.instance)); break;
      case 'snooze': await act(() => desk.snooze(el.dataset.instance, S.settings.snoozeMinutes), `Snoozed for ${S.settings.snoozeMinutes} minutes.`); break;
      case 'dismiss': await act(() => desk.dismiss(el.dataset.instance), 'Reminder dismissed. No more reminders for this one.'); break;
      case 'clear-missed': await act(() => desk.clearMissed(el.dataset.instance)); break;
      case 'clear-missed-all': await act(() => desk.clearMissed(null)); break;
      default: break;
    }
  }

  function onChange(e) {
    const el = e.target;
    if (el.dataset.act === 'toggle-task') {
      act(() => desk.completeTask(el.dataset.id, el.checked), el.checked ? 'Task completed.' : 'Task reopened.');
    }
  }

  function bindSettings() {
    const set = (patch) => act(() => desk.updateSettings(patch));
    $('#set-engine').addEventListener('change', (e) => set({ speechEngine: e.target.value, voiceName: '' }).then(renderVoices));
    $('#set-voice').addEventListener('change', (e) => set({ voiceName: e.target.value }));
    $('#set-volume').addEventListener('input', (e) => { $('#out-volume').textContent = Math.round(e.target.value * 100) + '%'; });
    $('#set-volume').addEventListener('change', (e) => set({ volume: Number(e.target.value) }));
    $('#set-rate').addEventListener('input', (e) => { $('#out-rate').textContent = Number(e.target.value).toFixed(1) + '×'; });
    $('#set-rate').addEventListener('change', (e) => set({ rate: Number(e.target.value) }));
    $('#set-muted').addEventListener('change', (e) => set({ muted: e.target.checked }));
    $('#set-snooze').addEventListener('change', (e) => set({ snoozeMinutes: Number(e.target.value) }));
    $('#set-notifications').addEventListener('change', (e) => set({ notifications: e.target.checked }));
    $('#set-login').addEventListener('change', (e) => set({ openAtLogin: e.target.checked }));
    $('#set-hidden').addEventListener('change', (e) => set({ startHidden: e.target.checked }));
    $('#btn-mute').addEventListener('click', () => set({ muted: !S.settings.muted }));
    $('#btn-test-voice').addEventListener('click', () => {
      speech.enqueue({ text: 'Reminder: Budget review with the Executive Director starts in 20 minutes.', force: true });
      $('#voice-status').textContent = S.settings.muted ? 'Playing test (reminders are currently muted).' : '';
    });
    speech.onVoices = () => { if (S && S.settings.speechEngine !== 'windows') renderVoices(); };

    // Attention mode
    $('#set-attention').addEventListener('change', (e) => set({ attentionEnabled: e.target.checked }));
    $('#set-att-offsets').addEventListener('change', () => set({
      attentionOffsets: $$('#set-att-offsets input').filter((c) => c.checked).map((c) => Number(c.value)),
    }));
    $('#set-att-tasks').addEventListener('change', (e) => set({ attentionTasks: e.target.checked }));
    $('#set-repeat').addEventListener('change', (e) => set({ repeatSeconds: Number(e.target.value) }));
    $('#set-flashing').addEventListener('change', (e) => set({ flashing: e.target.checked }));
    $('#set-alarm-sound').addEventListener('change', (e) => set({ alarmSound: e.target.value }));
    $('#set-alarm-volume').addEventListener('input', (e) => { $('#out-alarm-volume').textContent = Math.round(e.target.value * 100) + '%'; });
    $('#set-alarm-volume').addEventListener('change', (e) => set({ alarmVolume: Number(e.target.value) }));
    $('#set-alarm-seconds').addEventListener('change', (e) => set({ alarmSeconds: Number(e.target.value) }));
    $('#btn-test-alarm').addEventListener('click', () => {
      window.Alarm.play({ sound: $('#set-alarm-sound').value, volume: Number($('#set-alarm-volume').value), seconds: Number($('#set-alarm-seconds').value) });
    });
    $('#btn-stop-alarm').addEventListener('click', () => window.Alarm.stop());
    $('#btn-test-attention').addEventListener('click', () => act(() => desk.testAttention(), 'Test alert started. Press Acknowledge to stop it.'));

    // External vibration
    $('#set-gamepad').addEventListener('change', (e) => set({ vibrateGamepad: e.target.checked }));
    $('#btn-test-gamepad').addEventListener('click', async () => {
      const n = await window.Vibrate.pulse();
      renderGamepadStatus();
      if (!n) $('#gamepad-status').textContent = 'No vibrating controller found. Connect it, press any button on it once, then try again.';
      else $('#gamepad-status').textContent = `Vibrated ${n} controller${n > 1 ? 's' : ''}.`;
    });
    window.addEventListener('gamepadconnected', renderGamepadStatus);
    window.addEventListener('gamepaddisconnected', renderGamepadStatus);
    $('#set-webhook-type').addEventListener('change', (e) => set({ webhookType: e.target.value }));
    $('#set-webhook-url').addEventListener('change', (e) => set({ webhookUrl: e.target.value }));
    $('#set-webhook').addEventListener('change', async (e) => {
      const s = await set({ webhookEnabled: e.target.checked, webhookUrl: $('#set-webhook-url').value });
      if (e.target.checked && !s.webhookEnabled) toast('Enter the address (starting with https://) first.', 'error');
    });
    $('#btn-test-webhook').addEventListener('click', async () => {
      const st = $('#webhook-status');
      st.textContent = 'Sending…';
      try {
        await desk.testWebhook({ webhookType: $('#set-webhook-type').value, webhookUrl: $('#set-webhook-url').value });
        st.textContent = 'Sent. Your phone or watch should buzz.';
      } catch (err) {
        st.textContent = 'Failed: ' + err.message;
      }
    });
  }

  async function init() {
    buildClocks();
    tickClocks();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    $('#btn-add-meeting').addEventListener('click', () => openMeetingDialog(null));
    $('#btn-add-task').addEventListener('click', () => openTaskDialog(null));
    $('#meeting-filter').addEventListener('change', renderMeetings);
    $('#meeting-form').addEventListener('submit', submitMeeting);
    $('#meeting-form').addEventListener('input', updateMeetingPreview);
    $('#meeting-form').addEventListener('change', updateMeetingPreview);
    $('#task-form').addEventListener('submit', submitTask);
    $('#task-form').addEventListener('input', updateTaskSpeak);
    $('#task-form').addEventListener('change', updateTaskSpeak);
    for (const b of $$('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close());
    bindSettings();

    desk.onState((st) => { S = st; renderAll(); });
    desk.onAnnounce((a) => speech.enqueue({ key: a.key, text: a.text, alarm: !!a.attention, instance: a.instance }));
    desk.onSilence((instance) => speech.cancelWhere((e) => e.alarm && (instance == null || e.instance === instance)));
    desk.onFocus(handleFocus);
    S = await desk.getState();
    renderAll();
    document.body.dataset.ready = '1';

    // Clocks every second; relative times and task status every 30 s.
    setInterval(tickClocks, 1000);
    setInterval(() => { renderMeetings(); renderTasks(); renderAlerts(); }, 30000);
  }

  init();
})();
