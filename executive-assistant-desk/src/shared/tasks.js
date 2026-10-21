/*
 * Task status helpers. Task due dates/times are in the computer's local time zone.
 * Loaded by the main process (require) and the renderer (<script>).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tasks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

  function localDateStr(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Timestamp the task becomes due: its due time, or the end of its due date when no time is set. */
  function dueTimestamp(task) {
    const [y, m, d] = task.dueDate.split('-').map(Number);
    if (task.dueTime) {
      const [h, mi] = task.dueTime.split(':').map(Number);
      return new Date(y, m - 1, d, h, mi).getTime();
    }
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }

  /** 'completed' | 'overdue' | 'today' | 'upcoming' */
  function status(task, now) {
    if (task.completed) return 'completed';
    const today = localDateStr(now);
    if (task.dueDate < today) return 'overdue';
    if (task.dueTime && dueTimestamp(task) < now) return 'overdue';
    if (task.dueDate === today) return 'today';
    return 'upcoming';
  }

  function compare(a, b) {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    const ta = a.dueTime || '99:99', tb = b.dueTime || '99:99';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
  }

  /** Group tasks for display. Unfinished tasks always appear until completed. */
  function group(tasks, now) {
    const g = { overdue: [], today: [], upcoming: [], completed: [] };
    for (const t of tasks) g[status(t, now)].push(t);
    g.overdue.sort(compare);
    g.today.sort(compare);
    g.upcoming.sort(compare);
    g.completed.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    return g;
  }

  return { localDateStr, dueTimestamp, status, group, compare, PRIORITY_ORDER };
});
