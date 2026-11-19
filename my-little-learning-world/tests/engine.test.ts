import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questions } from '../src/content/questions';
import { selectQuestions, eligible, mockUnlocked, type SelectInput } from '../src/engine/examSelect';
import { applyAnswer, emptyMastery, levelFor, BOX_DAYS } from '../src/engine/mastery';
import { fit, toScreen, toFraction, hitPart } from '../src/engine/geometry';
import { lineKey, splitName } from '../src/audio/keys';

const DAY = 864e5;
let seed = 42;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const ALL = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'];
const input = (taught: string[], extra: Partial<SelectInput> = {}): SelectInput => ({
  bank: questions, taught, mastery: new Map(), now: Date.now(), hasPhoto: () => true, supplementaryUnlocked: false, rng, ...extra,
});

test('exams never ask about lessons that were not taught', () => {
  for (const mode of ['revision', 'minimock', 'picture', 'oral', 'recap'] as const) {
    for (let n = 1; n <= 9; n++) {
      const taught = ALL.slice(0, n);
      for (let k = 0; k < 20; k++) {
        const qs = selectQuestions(mode, input(taught));
        qs.forEach((q) => assert.ok(taught.includes(q.lesson), `${mode} picked ${q.id} with only ${taught.join(',')} taught`));
      }
    }
  }
});

test('lesson exam has 5 questions from that lesson only', () => {
  for (const l of ALL) {
    const qs = selectQuestions('lesson_exam', input([l], { lesson: l }));
    assert.equal(qs.length, 5);
    qs.forEach((q) => assert.equal(q.lesson, l));
    assert.equal(new Set(qs.map((q) => q.id)).size, 5, 'no repeats');
  }
});

test('mock exam: 20 questions, at least 2 per lesson, all four kinds, no repeats', () => {
  assert.ok(!mockUnlocked(ALL.slice(0, 8)));
  assert.ok(mockUnlocked(ALL));
  for (let k = 0; k < 30; k++) {
    const qs = selectQuestions('mock', input(ALL));
    assert.equal(qs.length, 20);
    assert.equal(new Set(qs.map((q) => q.id)).size, 20);
    for (const l of ALL) assert.ok(qs.filter((q) => q.lesson === l).length >= 2, `lesson ${l} under-represented`);
    for (const kind of ['identification', 'recall', 'understanding', 'application']) assert.ok(qs.some((q) => q.kind === kind));
  }
});

test('photo questions only appear when that body part is marked', () => {
  const qs = eligible(input(['L1'], { hasPhoto: (p) => p === 'nose' }));
  const photo = qs.filter((q) => q.format === 'photo');
  assert.ok(photo.length >= 1);
  photo.forEach((q) => assert.equal((q as any).part, 'nose'));
});

test('supplementary questions stay hidden until unlocked', () => {
  assert.ok(!eligible(input(ALL)).some((q) => q.supplementary));
  assert.ok(eligible(input(ALL, { supplementaryUnlocked: true })).some((q) => q.supplementary));
});

test('revision prefers struggling topics and caps one lesson at half', () => {
  const now = Date.now();
  const mastery = new Map<string, any>();
  // L2 topics mastered and not due; L3 topics struggling and overdue.
  for (const q of questions) {
    if (q.lesson === 'L2') mastery.set(q.topic, { ...emptyMastery(q.topic, 'L2'), level: 3, box: 5, totalAttempts: 10, recent: '11111', nextDueAt: now + 10 * DAY });
    if (q.lesson === 'L3') mastery.set(q.topic, { ...emptyMastery(q.topic, 'L3'), level: 1, box: 1, totalAttempts: 5, recent: '00100', nextDueAt: now - 2 * DAY });
  }
  const qs = selectQuestions('revision', input(['L2', 'L3'], { mastery, now }));
  const l3 = qs.filter((q) => q.lesson === 'L3').length;
  assert.equal(qs.length, 8);
  assert.ok(l3 >= qs.length / 2, `expected L3 to dominate, got ${l3}`);
  assert.ok(l3 <= Math.ceil(8 / 2), 'no lesson above half');
});

test('mastery: right answers climb the boxes, a wrong answer resets to box 1', () => {
  let m = emptyMastery('L1.nose', 'L1');
  const t0 = new Date(2026, 10, 1, 10).getTime();
  m = applyAnswer(m, true, t0);
  assert.equal(m.box, 2);
  assert.equal(m.nextDueAt, t0 + BOX_DAYS[2] * DAY);
  m = applyAnswer(m, true, t0 + DAY);
  m = applyAnswer(m, true, t0 + 3 * DAY);
  assert.equal(m.box, 4);
  m = applyAnswer(m, false, t0 + 4 * DAY);
  assert.equal(m.box, 1);
  assert.equal(m.recent, '1110');
});

test('mastery levels: Just Started, Learning, Getting Better, Mastered', () => {
  assert.equal(levelFor({ recent: '1', box: 2, totalAttempts: 1, daysCorrect: '' }), 0);
  assert.equal(levelFor({ recent: '001', box: 1, totalAttempts: 3, daysCorrect: '' }), 1);
  assert.equal(levelFor({ recent: '1101', box: 3, totalAttempts: 4, daysCorrect: 'a' }), 2);
  assert.equal(levelFor({ recent: '11011', box: 4, totalAttempts: 5, daysCorrect: '2026-11-01,2026-11-03' }), 3);
  // Mastery needs two different days, not one long session.
  assert.equal(levelFor({ recent: '11111', box: 5, totalAttempts: 5, daysCorrect: '2026-11-01' }), 2);
  let m = emptyMastery('L5.plants', 'L5');
  const t0 = new Date(2026, 10, 1, 10).getTime();
  [0, 0, 1, 3, 7].forEach((d) => (m = applyAnswer(m, true, t0 + d * DAY)));
  assert.equal(m.level, 3);
});

test('marker positions stay aligned at any screen size', () => {
  const m = { x: 0.51, y: 0.415, r: 0.05 };
  for (const [bw, bh] of [[400, 500], [1280, 800], [800, 1280], [300, 300]]) {
    const f = fit(720, 1280, bw, bh);
    const s = toScreen(m, f);
    const back = toFraction(s.x, s.y, f);
    assert.ok(Math.abs(back.x - m.x) < 1e-9 && Math.abs(back.y - m.y) < 1e-9);
    // Image is never cropped or stretched.
    assert.ok(f.w <= bw + 1e-9 && f.h <= bh + 1e-9);
    assert.ok(Math.abs(f.w / f.h - 720 / 1280) < 1e-9);
  }
});

test('tapping picks the nearest marker, within 1.3x its radius', () => {
  const markers = { eyes: { x: 0.5, y: 0.38, r: 0.085 }, nose: { x: 0.51, y: 0.415, r: 0.05 }, legs: null } as any;
  const f = fit(720, 1280, 720, 1280);
  const nose = toScreen(markers.nose, f);
  assert.equal(hitPart(nose.x, nose.y, markers, f), 'nose');
  const eye = toScreen(markers.eyes, f);
  assert.equal(hitPart(eye.x, eye.y - 10, markers, f), 'eyes');
  assert.equal(hitPart(10, 10, markers, f), null);
});

test('voice line keys are stable and the name is spoken separately', () => {
  assert.equal(lineKey('Hello  there'), lineKey('hello there'));
  assert.deepEqual(splitName('Hello, {name}! I am Bibi.'), ['Hello,', '{name}', '! I am Bibi.']);
  assert.deepEqual(splitName('Excellent, {name}!'), ['Excellent,', '{name}']);
});
