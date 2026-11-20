// Collects every spoken line from the content and writes tools/out/lines.json
// and tools/out/songs.json for the voice generator.
import { mkdirSync, writeFileSync } from 'node:fs';
import { lessons, worlds, P, unlockables, PVS_STAR } from '../src/content';
import { questions } from '../src/content/questions';
import { items } from '../src/content/items';
import { BODY_PARTS } from '../src/content/types';
import { lineKey, splitName, normalizeLine } from '../src/audio/keys';
import { bodyJob } from '../src/content/lessons/body';
import { extraLines } from '../src/content/extraLines';

const lines = new Map<string, string>();
const templates = new Set<string>(); // whole lines that contain {name}
const add = (t?: string) => {
  if (!t) return;
  if (t.includes('{name}')) templates.add(normalizeLine(t));
  for (const seg of splitName(t)) {
    if (seg === '{name}') continue;
    const n = normalizeLine(seg);
    lines.set(lineKey(n), n);
  }
};
const walk = (v: unknown) => {
  if (typeof v === 'string') add(v);
  else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === 'object') Object.values(v).forEach(walk);
};

walk(P);
extraLines().forEach(add);
for (const w of worlds) { add(w.title); add(w.badge.title); }
add(PVS_STAR.title);
unlockables.forEach((u) => add(u.title));
for (const l of lessons) {
  add(l.title);
  l.welcome.forEach(add);
  l.learn.forEach((c) => c.lines.forEach(add));
  add(l.explore.intro);
  l.explore.items.forEach((i) => { add(i.name); add(i.say); });
  // Practice: every string inside activity specs except art ids and bins ids.
  for (const a of l.practice) {
    add(a.title);
    const anyA = a as any;
    anyA.rounds?.forEach((r: any) => { add(r.prompt); add(r.explain); add(r.statement); });
    anyA.pairs?.forEach((p: any) => add(p.say));
    anyA.bins?.forEach((b: any) => add(b.label));
    anyA.steps?.forEach((s: any) => add(s.say));
    anyA.pages?.forEach((p: any) => add(p.say));
    add(anyA.done);
  }
  add(l.song.title);
}
for (const q of questions) { add(q.prompt); add(q.explain); }
for (const it of Object.values(items)) add(it.name.charAt(0).toUpperCase() + it.name.slice(1) + '.');
for (const part of BODY_PARTS) {
  P.photoFind.forEach((t) => add(t.replace('{part}', part)));
  add(`That is your ${part}.`);
  add(`Wonderful! That is your ${part}.`);
  add(bodyJob(part));
}

const songs = lessons.map((l) => ({ id: l.id, tune: l.song.tune, lines: l.song.lines.map((x) => x.text) }));

mkdirSync('tools/out', { recursive: true });
writeFileSync('tools/out/lines.json', JSON.stringify([...lines].map(([key, text]) => ({ key, text })), null, 1));
writeFileSync('tools/out/name-lines.json', JSON.stringify([...templates], null, 1));
writeFileSync('tools/out/songs.json', JSON.stringify(songs, null, 1));
console.log(`${lines.size} lines, ${songs.length} songs`);
