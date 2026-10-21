const test = require('node:test');
const assert = require('node:assert/strict');
const TZ = require('../src/shared/tz');

const iso = (ts) => new Date(ts).toISOString().slice(0, 16) + 'Z';

test('Lagos is UTC+1 all year (no daylight saving)', () => {
  assert.equal(iso(TZ.zonedToUtc('2026-01-15', '10:00', 'Africa/Lagos').utc), '2026-01-15T09:00Z');
  assert.equal(iso(TZ.zonedToUtc('2026-07-15', '10:00', 'Africa/Lagos').utc), '2026-07-15T09:00Z');
  assert.equal(TZ.isDst(Date.UTC(2026, 6, 1), 'Africa/Lagos'), false);
  assert.equal(TZ.abbreviation(Date.UTC(2026, 6, 1), 'Africa/Lagos'), 'WAT');
});

test('Toronto and New York switch between EST (UTC-5) and EDT (UTC-4)', () => {
  for (const z of ['America/Toronto', 'America/New_York']) {
    assert.equal(iso(TZ.zonedToUtc('2026-01-15', '10:00', z).utc), '2026-01-15T15:00Z');
    assert.equal(iso(TZ.zonedToUtc('2026-07-15', '10:00', z).utc), '2026-07-15T14:00Z');
    assert.equal(TZ.abbreviation(Date.UTC(2026, 0, 15, 15), z), 'EST');
    assert.equal(TZ.abbreviation(Date.UTC(2026, 6, 15, 14), z), 'EDT');
    assert.equal(TZ.isDst(Date.UTC(2026, 6, 15), z), true);
    assert.equal(TZ.isDst(Date.UTC(2026, 0, 15), z), false);
  }
});

test('the Lagos–Toronto gap changes from 6 to 5 hours when DST starts (8 March 2026)', () => {
  const before = TZ.zonedToUtc('2026-03-06', '14:00', 'Africa/Lagos').utc;
  const after = TZ.zonedToUtc('2026-03-09', '14:00', 'Africa/Lagos').utc;
  assert.equal(TZ.timeIn(before, 'America/Toronto'), '08:00');
  assert.equal(TZ.timeIn(after, 'America/Toronto'), '09:00');
  assert.equal(TZ.timeIn(after, 'America/New_York'), '09:00');
});

test('the gap returns to 6 hours when DST ends (1 November 2026)', () => {
  const sat = TZ.zonedToUtc('2026-10-31', '15:00', 'Africa/Lagos').utc;
  const mon = TZ.zonedToUtc('2026-11-02', '15:00', 'Africa/Lagos').utc;
  assert.equal(TZ.timeIn(sat, 'America/Toronto'), '10:00');
  assert.equal(TZ.timeIn(mon, 'America/Toronto'), '09:00');
});

test('a time skipped by spring-forward is flagged and moved forward', () => {
  const r = TZ.zonedToUtc('2026-03-08', '02:30', 'America/Toronto');
  assert.equal(r.nonexistent, true);
  assert.equal(iso(r.utc), '2026-03-08T07:30Z'); // 03:30 EDT
  assert.equal(TZ.timeIn(r.utc, 'America/Toronto'), '03:30');
});

test('a time repeated by fall-back is flagged and resolves to the first occurrence', () => {
  const r = TZ.zonedToUtc('2026-11-01', '01:30', 'America/New_York');
  assert.equal(r.ambiguous, true);
  assert.equal(iso(r.utc), '2026-11-01T05:30Z'); // 01:30 EDT
  const plain = TZ.zonedToUtc('2026-11-01', '03:00', 'America/New_York');
  assert.equal(plain.ambiguous, false);
  assert.equal(iso(plain.utc), '2026-11-01T08:00Z'); // 03:00 EST
});

test('equivalents mark a different calendar date in another location', () => {
  const late = TZ.zonedToUtc('2026-10-21', '23:30', 'America/Toronto').utc;
  const eq = TZ.equivalents(late, 'America/Toronto');
  const lagos = eq.find((e) => e.zone === 'Africa/Lagos');
  assert.equal(lagos.date, '2026-10-22');
  assert.equal(lagos.time, '04:30');
  assert.equal(lagos.dayShift, 1);
  assert.equal(TZ.dayShiftLabel(lagos.dayShift), 'Next day');
  assert.equal(eq.find((e) => e.zone === 'America/New_York').dayShift, 0);
  assert.equal(eq.find((e) => e.isOrigin).zone, 'America/Toronto');

  const early = TZ.zonedToUtc('2026-10-22', '02:00', 'Africa/Lagos').utc;
  const eq2 = TZ.equivalents(early, 'Africa/Lagos');
  const toronto = eq2.find((e) => e.zone === 'America/Toronto');
  assert.equal(toronto.date, '2026-10-21');
  assert.equal(toronto.time, '21:00');
  assert.equal(toronto.dayShift, -1);
  assert.equal(TZ.dayShiftLabel(-1), 'Previous day');
});

test('invalid input is rejected', () => {
  assert.throws(() => TZ.zonedToUtc('2026-02-30', '10:00', 'Africa/Lagos'));
  assert.throws(() => TZ.zonedToUtc('2026-02-10', '25:00', 'Africa/Lagos'));
  assert.throws(() => TZ.zonedToUtc('2026-02-10', '10:00', 'Mars/Base'));
});
