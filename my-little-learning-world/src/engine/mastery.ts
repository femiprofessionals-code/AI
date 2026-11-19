import type { TopicMastery } from '../db/types';

const DAY = 24 * 60 * 60 * 1000;
// Box -> days until the topic comes back. Box 1 = next session (due now).
export const BOX_DAYS = [0, 0, 2, 4, 7, 14];

export const LEVEL_NAMES = ['Just Started', 'Learning', 'Getting Better', 'Mastered'] as const;

export const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function emptyMastery(topicId: string, lessonId: string): TopicMastery {
  return { topicId, lessonId, level: 0, box: 1, recent: '', totalAttempts: 0, totalCorrect: 0, daysCorrect: '', lastSeenAt: null, nextDueAt: null };
}

export function levelFor(m: Pick<TopicMastery, 'recent' | 'box' | 'totalAttempts' | 'daysCorrect'>): 0 | 1 | 2 | 3 {
  if (m.totalAttempts < 3) return 0;
  const last = m.recent.slice(-5);
  const acc = last.split('').filter((c) => c === '1').length / last.length;
  const days = new Set(m.daysCorrect.split(',').filter(Boolean)).size;
  const correctOfLast5 = last.split('').filter((c) => c === '1').length;
  if (last.length >= 5 && correctOfLast5 >= 4 && m.box >= 4 && days >= 2) return 3;
  if (acc < 0.6) return 1;
  return 2;
}

// Update a topic after one answer. Only first tries count as correct.
export function applyAnswer(m: TopicMastery, firstTryCorrect: boolean, now: number): TopicMastery {
  const box = firstTryCorrect ? Math.min(5, m.box + 1) : 1;
  const recent = (m.recent + (firstTryCorrect ? '1' : '0')).slice(-5);
  let daysCorrect = m.daysCorrect;
  if (firstTryCorrect) {
    const days = daysCorrect.split(',').filter(Boolean);
    const today = dayKey(now);
    if (!days.includes(today)) days.push(today);
    daysCorrect = days.slice(-5).join(',');
  }
  const next: TopicMastery = {
    ...m,
    box,
    recent,
    daysCorrect,
    totalAttempts: m.totalAttempts + 1,
    totalCorrect: m.totalCorrect + (firstTryCorrect ? 1 : 0),
    lastSeenAt: now,
    nextDueAt: now + BOX_DAYS[box] * DAY,
  };
  next.level = levelFor(next);
  return next;
}

// How urgently a topic should be revised; higher = sooner.
export function revisionPriority(m: TopicMastery | undefined, now: number): number {
  if (!m || m.totalAttempts === 0) return 50; // taught but never tested
  const overdueDays = m.nextDueAt == null ? 0 : (now - m.nextDueAt) / DAY;
  const struggle = 3 - m.level; // 3 for Just Started ... 0 for Mastered
  return (overdueDays >= 0 ? 20 + Math.min(overdueDays, 14) : -10 + overdueDays) + struggle * 10;
}

export const isDue = (m: TopicMastery | undefined, now: number) => !m || m.nextDueAt == null || m.nextDueAt <= now;
