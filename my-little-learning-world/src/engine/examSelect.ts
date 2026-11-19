import type { Question, QuestionKind } from '../content/types';
import type { TopicMastery } from '../db/types';
import { revisionPriority } from './mastery';

export type ExamMode = 'lesson_exam' | 'practice' | 'revision' | 'mock' | 'minimock' | 'picture' | 'oral' | 'recap';

export type SelectInput = {
  bank: Question[];
  taught: string[]; // lesson ids whose Listen and Learn stage is finished
  mastery: Map<string, TopicMastery>;
  now: number;
  hasPhoto: (part: string) => boolean;
  supplementaryUnlocked: boolean;
  lesson?: string;
  rng?: () => number;
};

export const MODE_SIZES: Record<ExamMode, number> = {
  lesson_exam: 5, practice: 8, revision: 8, mock: 20, minimock: 10, picture: 10, oral: 10, recap: 2,
};

function shuffle<T>(a: T[], rng: () => number): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// Never returns a question from a lesson that has not been taught.
export function eligible(input: SelectInput): Question[] {
  return input.bank.filter(
    (q) =>
      input.taught.includes(q.lesson) &&
      (input.supplementaryUnlocked || !q.supplementary) &&
      (q.format !== 'photo' || input.hasPhoto(q.part)),
  );
}

// Pick n questions favouring the topics that most need revision, without
// repeating a topic until every eligible topic has been used once.
function byPriority(pool: Question[], n: number, input: SelectInput, rng: () => number): Question[] {
  const scored = shuffle(pool, rng).map((q) => ({ q, p: revisionPriority(input.mastery.get(q.topic), input.now) + rng() * 5 }));
  scored.sort((a, b) => b.p - a.p);
  const picked: Question[] = [];
  const usedTopics = new Set<string>();
  for (const pass of [0, 1, 2]) {
    for (const { q } of scored) {
      if (picked.length >= n) break;
      if (picked.includes(q)) continue;
      if (pass === 0 && usedTopics.has(q.topic)) continue;
      picked.push(q);
      usedTopics.add(q.topic);
    }
  }
  return picked;
}

export function selectQuestions(mode: ExamMode, input: SelectInput): Question[] {
  const rng = input.rng ?? Math.random;
  const size = MODE_SIZES[mode];
  let pool = eligible(input);

  if (mode === 'lesson_exam' || mode === 'practice') {
    pool = pool.filter((q) => q.lesson === input.lesson);
    return byPriority(pool, size, input, rng);
  }
  if (mode === 'picture') {
    pool = pool.filter((q) => q.kind === 'identification' && q.format !== 'truefalse');
    return byPriority(pool, size, input, rng);
  }
  if (mode === 'oral' || mode === 'revision' || mode === 'recap') {
    // No single lesson fills more than half of a revision set.
    const picked = byPriority(pool, pool.length, input, rng);
    const perLesson = new Map<string, number>();
    const cap = input.taught.length > 1 ? Math.ceil(size / 2) : size;
    const out: Question[] = [];
    for (const q of picked) {
      if (out.length >= size) break;
      const c = perLesson.get(q.lesson) ?? 0;
      if (c >= cap) continue;
      perLesson.set(q.lesson, c + 1);
      out.push(q);
    }
    return out;
  }
  // mock / minimock: at least 2 per lesson (when possible) and all four kinds.
  const lessons = [...new Set(pool.map((q) => q.lesson))];
  const out: Question[] = [];
  for (const l of shuffle(lessons, rng)) {
    out.push(...shuffle(pool.filter((q) => q.lesson === l), rng).slice(0, 2));
  }
  const kinds: QuestionKind[] = ['identification', 'recall', 'understanding', 'application'];
  for (const k of kinds) {
    if (!out.some((q) => q.kind === k)) {
      const extra = shuffle(pool.filter((q) => q.kind === k && !out.includes(q)), rng)[0];
      if (extra) out.push(extra);
    }
  }
  const rest = shuffle(pool.filter((q) => !out.includes(q)), rng);
  while (out.length < size && rest.length) out.push(rest.shift()!);
  return shuffle(out.slice(0, size), rng);
}

export const mockUnlocked = (taught: string[]) => ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9'].every((l) => taught.includes(l));
