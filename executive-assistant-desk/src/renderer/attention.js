/* global TZ */
/* The flashing, always-on-top alert shown in attention mode. */
(function () {
  const desk = window.desk;
  const root = document.getElementById('alerts');
  let S = null;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now() + (S ? S.clockOffset : 0);

  function whenText(a) {
    const mins = Math.round((a.startUtc - now()) / 60000);
    const verb = a.kind === 'task' ? 'Due' : 'Starts';
    if (mins > 0) return `${verb} in ${mins} minute${mins === 1 ? '' : 's'}`;
    if (mins === 0) return a.kind === 'task' ? 'Due now' : 'Starting now';
    return `${a.kind === 'task' ? 'Was due' : 'Started'} ${-mins} minute${mins === -1 ? '' : 's'} ago`;
  }

  function render() {
    if (!S) return;
    const list = S.reminders.active.filter((x) => x.needsAck).sort((a, b) => a.startUtc - b.startUtc);
    document.body.classList.toggle('flash', !!S.settings.flashing && list.length > 0);
    root.innerHTML = list.map((a) => {
      const meeting = a.kind === 'meeting' ? S.meetings.find((m) => m.id === a.refId) : null;
      const zones = a.kind === 'task' ? '' : TZ.equivalents(a.startUtc, meeting ? meeting.timeZone : 'Africa/Lagos')
        .map((e) => `${esc(e.short)} ${esc(e.time12)}${e.dayShift ? ` (${esc(e.dateShort)})` : ''}`).join(' · ');
      return `<section class="item">
        <div class="title">${a.kind === 'test' ? 'TEST — ' : ''}${esc(a.title)}</div>
        <div class="when">${esc(whenText(a))}</div>
        ${zones ? `<div class="zones">${zones}</div>` : ''}
        <div class="actions">
          <button class="ack" data-act="ack" data-instance="${esc(a.instance)}">Acknowledge</button>
          ${meeting && meeting.link ? `<button data-act="join" data-link="${esc(meeting.link)}" data-instance="${esc(a.instance)}">Join meeting</button>` : ''}
          <button data-act="snooze" data-instance="${esc(a.instance)}">Snooze ${S.settings.snoozeMinutes} min</button>
          <button data-act="dismiss" data-instance="${esc(a.instance)}">Dismiss</button>
          <button data-act="open">Open app</button>
        </div>
      </section>`;
    }).join('');
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const inst = b.dataset.instance;
    if (b.dataset.act === 'ack') await desk.acknowledge(inst);
    if (b.dataset.act === 'join') { await desk.acknowledge(inst); await desk.openLink(b.dataset.link); }
    if (b.dataset.act === 'snooze') await desk.snooze(inst, S.settings.snoozeMinutes);
    if (b.dataset.act === 'dismiss') await desk.dismiss(inst);
    if (b.dataset.act === 'open') await desk.showMain('alerts');
  });

  desk.onState((st) => { S = st; render(); });
  desk.onAttentionAlert(() => {
    // Restart the flash so a repeat is noticeable, and buzz an external controller if enabled.
    document.body.classList.remove('flash');
    void document.body.offsetWidth;
    render();
    if (S && S.settings.vibrateGamepad && window.Vibrate) window.Vibrate.pulse().catch(() => {});
  });
  desk.getState().then((st) => { S = st; render(); document.body.dataset.ready = '1'; });
  setInterval(render, 15000);
})();
