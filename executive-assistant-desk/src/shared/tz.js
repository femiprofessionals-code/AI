/*
 * Time-zone helpers built only on the Intl API (full ICU ships with Electron),
 * so daylight saving changes come from the IANA database automatically.
 * Loaded by the main process (require) and the renderer (<script>).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TZ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ZONES = [
    { id: 'Africa/Lagos', label: 'Nigeria', city: 'Lagos', short: 'Nigeria' },
    { id: 'America/Toronto', label: 'Scarborough, Ontario', city: 'Scarborough', short: 'Scarborough' },
    { id: 'America/New_York', label: 'New York', city: 'New York', short: 'New York' },
  ];

  const MINUTE = 60 * 1000;
  const fmtCache = new Map();

  function partsFormatter(zone) {
    let f = fmtCache.get(zone);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        weekday: 'short',
      });
      fmtCache.set(zone, f);
    }
    return f;
  }

  function isValidZone(zone) {
    try { partsFormatter(zone); return true; } catch (_) { return false; }
  }

  /** Wall-clock parts of instant `ts` in `zone`. */
  function wallParts(ts, zone) {
    const out = {};
    for (const p of partsFormatter(zone).formatToParts(new Date(ts))) {
      if (p.type !== 'literal') out[p.type] = p.value;
    }
    return {
      year: +out.year, month: +out.month, day: +out.day,
      hour: +out.hour % 24, minute: +out.minute, second: +out.second,
      weekday: out.weekday,
    };
  }

  /** Offset of `zone` from UTC at instant `ts`, in minutes (Lagos = +60, Toronto in summer = -240). */
  function offsetMinutes(ts, zone) {
    const w = wallParts(ts, zone);
    const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
    return Math.round((asUtc - Math.floor(ts / 1000) * 1000) / MINUTE);
  }

  function parseDate(date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const check = new Date(Date.UTC(y, mo - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
    return { y, mo, d };
  }

  function parseTime(time) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return { h: +m[1], mi: +m[2] };
  }

  /**
   * Convert a wall-clock date/time in `zone` to a UTC timestamp.
   * - Ambiguous times (clocks fall back, the hour happens twice) resolve to the
   *   first occurrence and set `ambiguous: true`.
   * - Times that do not exist (clocks spring forward) are moved forward by the
   *   size of the gap and set `nonexistent: true`.
   */
  function zonedToUtc(date, time, zone) {
    const d = parseDate(date), t = parseTime(time);
    if (!d || !t) throw new Error('Invalid date or time');
    if (!isValidZone(zone)) throw new Error('Unknown time zone: ' + zone);
    const naive = Date.UTC(d.y, d.mo - 1, d.d, t.h, t.mi);
    const offsets = new Set([
      offsetMinutes(naive - 14 * 60 * MINUTE, zone),
      offsetMinutes(naive, zone),
      offsetMinutes(naive + 14 * 60 * MINUTE, zone),
    ]);
    const matches = [];
    for (const off of offsets) {
      const cand = naive - off * MINUTE;
      if (offsetMinutes(cand, zone) === off) matches.push(cand);
    }
    matches.sort((a, b) => a - b);
    if (matches.length >= 1) {
      return { utc: matches[0], ambiguous: matches.length > 1, nonexistent: false };
    }
    // Gap: interpret using the offset in force just before the transition.
    const before = offsetMinutes(naive - 14 * 60 * MINUTE, zone);
    return { utc: naive - before * MINUTE, ambiguous: false, nonexistent: true };
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  /** Calendar date string (YYYY-MM-DD) of instant ts in zone. */
  function dateIn(ts, zone) {
    const w = wallParts(ts, zone);
    return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
  }

  function timeIn(ts, zone) {
    const w = wallParts(ts, zone);
    return `${pad(w.hour)}:${pad(w.minute)}`;
  }

  /** Whole-day difference between two YYYY-MM-DD strings (b - a). */
  function dayDiff(a, b) {
    const pa = parseDate(a), pb = parseDate(b);
    return Math.round((Date.UTC(pb.y, pb.mo - 1, pb.d) - Date.UTC(pa.y, pa.mo - 1, pa.d)) / (24 * 60 * MINUTE));
  }

  function formatOffset(mins) {
    const sign = mins >= 0 ? '+' : '-';
    const a = Math.abs(mins);
    return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? ':' + pad(a % 60) : ''}`;
  }

  /** Short name such as EDT / EST; falls back to WAT for Lagos, else UTC±h. */
  function abbreviation(ts, zone) {
    if (zone === 'Africa/Lagos') return 'WAT';
    try {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
        .formatToParts(new Date(ts)).find((x) => x.type === 'timeZoneName');
      if (p && !/^GMT/.test(p.value)) return p.value;
    } catch (_) { /* ignore */ }
    return formatOffset(offsetMinutes(ts, zone));
  }

  /** True when the zone is observing daylight saving time at ts. */
  function isDst(ts, zone) {
    const y = new Date(ts).getUTCFullYear();
    const jan = offsetMinutes(Date.UTC(y, 0, 1), zone);
    const jul = offsetMinutes(Date.UTC(y, 6, 1), zone);
    if (jan === jul) return false;
    return offsetMinutes(ts, zone) === Math.max(jan, jul);
  }

  function formatTime12(ts, zone, withSeconds) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hour: 'numeric', minute: '2-digit',
      second: withSeconds ? '2-digit' : undefined, hour12: true,
    }).format(new Date(ts));
  }

  function formatDateLong(ts, zone) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }).format(new Date(ts));
  }

  function formatDateShort(ts, zone) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone, weekday: 'short', month: 'short', day: 'numeric',
    }).format(new Date(ts));
  }

  /**
   * Equivalent time of instant `ts` in every configured zone.
   * `dayShift` is relative to `refZone`'s calendar date (e.g. +1 = next day).
   */
  function equivalents(ts, refZone) {
    const refDate = dateIn(ts, refZone);
    return ZONES.map((z) => {
      const date = dateIn(ts, z.id);
      return {
        zone: z.id,
        label: z.label,
        short: z.short,
        date,
        time: timeIn(ts, z.id),
        time12: formatTime12(ts, z.id, false),
        dateShort: formatDateShort(ts, z.id),
        abbr: abbreviation(ts, z.id),
        offset: formatOffset(offsetMinutes(ts, z.id)),
        dayShift: dayDiff(refDate, date),
        isOrigin: z.id === refZone,
      };
    });
  }

  function dayShiftLabel(shift) {
    if (shift === 0) return '';
    if (shift === 1) return 'Next day';
    if (shift === -1) return 'Previous day';
    return (shift > 0 ? '+' : '') + shift + ' days';
  }

  function zoneLabel(id) {
    const z = ZONES.find((x) => x.id === id);
    return z ? z.label : id;
  }

  return {
    ZONES, wallParts, offsetMinutes, zonedToUtc, dateIn, timeIn, dayDiff,
    formatOffset, abbreviation, isDst, formatTime12, formatDateLong, formatDateShort,
    equivalents, dayShiftLabel, zoneLabel, isValidZone, parseDate, parseTime, pad,
  };
});
