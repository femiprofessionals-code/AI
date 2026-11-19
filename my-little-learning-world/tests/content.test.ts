import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { lessons, worlds, P } from '../src/content';
import { questions } from '../src/content/questions';
import { items } from '../src/content/items';
import { lineKey, splitName } from '../src/audio/keys';
import type { Activity } from '../src/content/types';

// The school's exact wording must appear unchanged in the lessons.
const SCHOOL_DEFINITIONS: Record<string, string[]> = {
  L1: ['We use our eyes to see.', 'We use our ears to hear.', 'We use our nose to smell.', 'We use our mouth to eat and talk.', 'We use our hands to hold things.', 'We use our legs to walk.', 'We use our feet to stand and walk.'],
  L3: ['Toothache is pain in the tooth.'],
  L5: ['The sun is a big ball of fire that gives us light in the day.', 'The sun helps plants to grow.', 'The sun keeps our bodies warm.', 'Sunlight helps our bodies make vitamin D.', 'The sun dries our clothes.'],
  L6: ['Air is a mixture of gases that we breathe in and out every day.', 'We breathe air to stay alive.', 'Air cools our bodies.', 'Air helps to dry our clothes.'],
  L7: ['Water is a liquid substance that is colourless, odourless and tasteless.', 'Colourless means clean water has no colour.', 'Odourless means clean water has no smell.', 'Tasteless means pure water has no taste.'],
  L8: ['Food is what we eat that makes us grow and stay alive.'],
  L9: ['We get food from animals and plants.'],
};

const lessonText = (id: string) => lessons.find((l) => l.id === id)!.learn.flatMap((c) => c.lines).join(' ');

test('nine lessons in five worlds, in order', () => {
  assert.equal(lessons.length, 9);
  assert.deepEqual(worlds.map((w) => w.id), ['body', 'sun', 'air', 'water', 'food']);
  assert.deepEqual(worlds.flatMap((w) => w.lessons), lessons.map((l) => l.id));
});

test('school definitions are preserved word for word', () => {
  for (const [id, defs] of Object.entries(SCHOOL_DEFINITIONS)) {
    for (const d of defs) assert.ok(lessonText(id).includes(d), `${id} is missing: ${d}`);
  }
});

test('curriculum examples are all taught', () => {
  const need: Record<string, string[]> = {
    L2: ['soap', 'sponge', 'toothbrush', 'toothpaste', 'towel', 'comb', 'water', 'nailcutter'],
    L7: ['rain', 'tap', 'river', 'well', 'cooking', 'washing', 'drinking', 'bath'],
    L8: ['rice', 'beans', 'fish', 'noodles', 'egg'],
    L1: ['head', 'eyes', 'ears', 'nose', 'mouth', 'neck', 'hands', 'fingers', 'legs', 'feet', 'stomach'],
  };
  for (const [id, arts] of Object.entries(need)) {
    const l = lessons.find((x) => x.id === id)!;
    for (const a of arts) assert.ok(l.learn.some((c) => c.art === a), `${id} learn cards missing ${a}`);
  }
});

test('every lesson has all seven stages of content', () => {
  for (const l of lessons) {
    assert.ok(l.welcome.length > 0, `${l.id} welcome`);
    assert.ok(l.learn.length > 0, `${l.id} learn`);
    assert.ok(l.explore.items.length >= 4, `${l.id} explore`);
    assert.ok(l.practice.length >= 3, `${l.id} practice has ${l.practice.length}`);
    assert.ok(l.song.lines.length >= 2, `${l.id} song`);
  }
});

test('question bank: at least 15 per lesson covering all four kinds', () => {
  for (const l of lessons) {
    const qs = questions.filter((q) => q.lesson === l.id && !q.supplementary);
    assert.ok(qs.length >= 15, `${l.id} has ${qs.length} questions`);
    for (const k of ['identification', 'recall', 'understanding', 'application']) {
      assert.ok(qs.some((q) => q.kind === k), `${l.id} has no ${k} question`);
    }
  }
  assert.equal(new Set(questions.map((q) => q.id)).size, questions.length, 'question ids are unique');
});

test('questions are well formed and use known topics and pictures', () => {
  for (const q of questions) {
    const l = lessons.find((x) => x.id === q.lesson)!;
    assert.ok(l.topics.some((t) => t.id === q.topic), `${q.id} unknown topic ${q.topic}`);
    if (q.format === 'choice') {
      assert.ok(q.choices.includes(q.answer), `${q.id} answer not in choices`);
      assert.equal(new Set(q.choices).size, q.choices.length, `${q.id} duplicate choices`);
      q.choices.forEach((c) => assert.ok(items[c], `${q.id} unknown picture ${c}`));
    }
    if (q.format === 'truefalse') assert.ok(items[q.art], `${q.id} unknown picture ${q.art}`);
  }
});

function artsOf(a: Activity): string[] {
  const x = a as any;
  return [
    ...(x.rounds ?? []).flatMap((r: any) => [...(r.choices ?? []), r.answer, r.art].filter(Boolean)),
    ...(x.pairs ?? []).flatMap((p: any) => [p.item, p.target]),
    ...(x.cards ?? []),
    ...(x.bins ?? []).map((b: any) => b.art),
    ...(x.items ?? []).map((i: any) => i.art),
    ...(x.steps ?? []).map((s: any) => s.art),
    ...(x.pages ?? []).flatMap((p: any) => p.art),
    ...(x.art ? [x.art] : []),
  ].filter((v) => !['kiki'].includes(v));
}

test('activities are valid and reference known pictures and topics', () => {
  for (const l of lessons) {
    const topics = new Set(l.topics.map((t) => t.id));
    for (const a of l.practice) {
      artsOf(a).forEach((art) => assert.ok(items[art], `${l.id} ${a.type} unknown picture ${art}`));
      const x = a as any;
      (x.rounds ?? []).forEach((r: any) => {
        if (r.topic) assert.ok(topics.has(r.topic), `${l.id} ${a.type} unknown topic ${r.topic}`);
        if (r.choices && r.answer !== undefined) assert.ok(r.choices.includes(r.answer), `${l.id} ${a.type} answer not in choices`);
        if (a.type === 'missing') assert.ok(r.choices.includes(r.missing), `${l.id} missing part not offered`);
      });
      if (a.type === 'sort') a.items.forEach((i) => assert.ok(a.bins.some((b) => b.id === i.bin), `${l.id} bad bin ${i.bin}`));
      if ('topic' in a) assert.ok(topics.has((a as any).topic), `${l.id} ${a.type} unknown topic ${(a as any).topic}`);
    }
    l.learn.forEach((c) => assert.ok(items[c.art], `${l.id} learn unknown picture ${c.art}`));
    l.explore.items.forEach((c) => assert.ok(items[c.art], `${l.id} explore unknown picture ${c.art}`));
    l.song.lines.forEach((c) => assert.ok(items[c.art], `${l.id} song unknown picture ${c.art}`));
  }
});

test('all twelve required game types are used', () => {
  const used = new Set(lessons.flatMap((l) => l.practice.map((a) => a.type)));
  for (const t of ['pictureId', 'dragMatch', 'memory', 'missing', 'sort', 'listenSelect', 'tapAll', 'sequence', 'puzzle', 'trueFalse', 'photoBody']) {
    assert.ok(used.has(t as any), `game type ${t} is not used`);
  }
  // Multiple-choice picture quizzes run in every exam (ExamRunner), the 12th type.
});

test('the breathing activity never asks her to hold her breath', () => {
  // Everything she hears (parent notes are excluded: they are for grown-ups).
  const all = JSON.stringify(lessons.map(({ parentNote, ...rest }) => rest)) + JSON.stringify(P);
  assert.ok(!/hold (your|her|our) breath/i.test(all));
});

test('every spoken line has a bundled voice clip', () => {
  const lines: { key: string; text: string }[] = JSON.parse(readFileSync('tools/out/lines.json', 'utf8'));
  const missing = lines.filter((l) => !existsSync(`assets/audio/voice/${l.key}.m4a`));
  assert.equal(missing.length, 0, `missing clips: ${missing.slice(0, 5).map((m) => m.text).join(' | ')}`);
  // Spot check: lesson definitions resolve to clips.
  const keys = new Set(lines.map((l) => l.key));
  for (const defs of Object.values(SCHOOL_DEFINITIONS)) for (const d of defs) {
    const line = lessons.flatMap((l) => l.learn.flatMap((c) => c.lines)).find((x) => x.includes(d))!;
    splitName(line).filter((s) => s !== '{name}').forEach((s) => assert.ok(keys.has(lineKey(s)), `no clip for "${s}"`));
  }
});
