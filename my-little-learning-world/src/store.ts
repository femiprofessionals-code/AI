import { create } from 'zustand';
import { repo } from './db/repo';
import type { LessonProgress, PhotoRow, TopicMastery, RewardRow, DayRow, AttemptContext } from './db/types';
import { applyAnswer, emptyMastery, dayKey } from './engine/mastery';
import { lessons, worlds, worldOfLesson, PVS_STAR, unlockables } from './content';
import { STARTER } from './private.generated';
import { configureAudio } from './audio/audio';

// ---------------- navigation ----------------
export type Route =
  | { name: 'home' }
  | { name: 'worlds' }
  | { name: 'world'; world: string }
  | { name: 'lesson'; lesson: string; stage?: number }
  | { name: 'play' }
  | { name: 'game'; lesson: string; index: number }
  | { name: 'photo'; mode: 'explore' | 'question' }
  | { name: 'revision' }
  | { name: 'exams' }
  | { name: 'exam'; mode: string; lesson?: string }
  | { name: 'rewards' }
  | { name: 'songs' }
  | { name: 'done' }
  | { name: 'parentGate' }
  | { name: 'parent'; tab?: string };

export type Settings = {
  narrationVolume: number;
  sfxVolume: number;
  musicVolume: number;
  dailyMinutes: number;
  timedMode: boolean;
  reduceMotion: boolean;
  useParentNameClip: boolean;
  companion: string;
  pinSet: boolean;
  unlockAll: boolean;
};

const DEFAULTS: Settings = {
  narrationVolume: 1, sfxVolume: 0.7, musicVolume: 0.7, dailyMinutes: 20, timedMode: false, reduceMotion: false,
  useParentNameClip: true, companion: 'bibi', pinSet: false, unlockAll: false,
};

type State = {
  loaded: boolean;
  stack: Route[];
  name: string;
  settings: Settings;
  progress: Record<string, LessonProgress>;
  mastery: Record<string, TopicMastery>;
  stars: number;
  rewards: RewardRow[];
  photos: PhotoRow[];
  recordings: Record<string, string>;
  today: DayRow;
  caption: string | null;
  celebration: { badge?: { title: string; art: string }; friend?: string } | null;
  lastExam: { lessonId: string; correct: number; total: number; stars: number } | null;
  celebrationQueue: NonNullable<State['celebration']>[];

  load(): void;
  go(r: Route): void;
  replace(r: Route): void;
  back(): void;
  home(): void;
  setName(n: string): void;
  setSetting<K extends keyof Settings>(k: K, v: Settings[K]): void;
  setCaption(c: string | null): void;
  lessonState(id: string): LessonProgress;
  saveLesson(p: LessonProgress): void;
  answer(a: { questionId: string; topicId: string; lessonId: string; context: AttemptContext; examId?: number | null; chosen?: string | null; correct: boolean; attemptNo: number; responseMs?: number | null }): void;
  addStars(n: number, source: string): void;
  checkRewards(): void;
  clearCelebration(): void;
  refreshPhotos(): void;
  refreshRecordings(): void;
  tickSeconds(s: number): void;
  touchLesson(id: string): void;
  unlockExtraTime(): void;
  resetProgress(): void;
  deleteEverything(): void;
};

const freshLesson = (id: string): LessonProgress => ({
  lessonId: id, status: 'not_started', stage: 1, taught: false, stars: 0, firstCompletedAt: null, lastOpenedAt: null, timesCompleted: 0,
});

const freshDay = (): DayRow => ({ date: dayKey(Date.now()), activeSeconds: 0, lessonsTouched: [], finished: false, unlockedExtra: false });

function readSettings(): Settings {
  const s = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const v = repo.getSetting(k);
    if (v != null) (s as any)[k] = JSON.parse(v);
  }
  return s;
}

export const useApp = create<State>((set, get) => ({
  loaded: false,
  stack: [{ name: 'home' }],
  name: '',
  settings: DEFAULTS,
  progress: {},
  mastery: {},
  stars: 0,
  rewards: [],
  photos: [],
  recordings: {},
  today: freshDay(),
  caption: null,
  celebration: null,
  lastExam: null,
  celebrationQueue: [],

  load() {
    repo.init();
    // First run: seed the starter profile and photo bundled for this family.
    if (repo.getSetting('initialised') == null) {
      if (STARTER.childName) repo.setSetting('childName', STARTER.childName);
      if (STARTER.photo) {
        repo.savePhoto({ kind: 'full_body', uri: 'starter', width: STARTER.photo.width, height: STARTER.photo.height, markers: STARTER.photo.markers, updatedAt: Date.now() });
      }
      repo.setSetting('initialised', '1');
    }
    const progress: Record<string, LessonProgress> = {};
    repo.getLessonProgress().forEach((p) => (progress[p.lessonId] = p));
    const mastery: Record<string, TopicMastery> = {};
    repo.getMastery().forEach((m) => (mastery[m.topicId] = m));
    const settings = readSettings();
    const name = repo.getSetting('childName') ?? '';
    const today = repo.getDay(dayKey(Date.now())) ?? freshDay();
    set({ loaded: true, progress, mastery, settings, name, stars: repo.totalStars(), rewards: repo.getRewards(), today });
    get().refreshPhotos();
    get().refreshRecordings();
    configureAudio({ ...settings, name, onCaption: (c) => get().setCaption(c) });
  },

  go: (r) => set((s) => ({ stack: [...s.stack, r] })),
  replace: (r) => set((s) => ({ stack: [...s.stack.slice(0, -1), r] })),
  back: () => set((s) => ({ stack: s.stack.length > 1 ? s.stack.slice(0, -1) : s.stack })),
  home: () => set({ stack: [{ name: 'home' }] }),

  setName(n) {
    repo.setSetting('childName', n);
    set({ name: n });
    configureAudio({ name: n });
  },
  setSetting(k, v) {
    repo.setSetting(k, JSON.stringify(v));
    const settings = { ...get().settings, [k]: v };
    set({ settings });
    configureAudio(settings);
  },
  setCaption: (c) => set({ caption: c }),

  lessonState: (id) => get().progress[id] ?? freshLesson(id),
  saveLesson(p) {
    const next = { ...p, lastOpenedAt: Date.now() };
    repo.saveLessonProgress(next);
    set((s) => ({ progress: { ...s.progress, [p.lessonId]: next } }));
  },

  answer(a) {
    const now = Date.now();
    repo.addAttempt({ questionId: a.questionId, topicId: a.topicId, lessonId: a.lessonId, context: a.context, examId: a.examId ?? null, chosen: a.chosen ?? null, correct: a.correct, attemptNo: a.attemptNo, responseMs: a.responseMs ?? null, at: now });
    // Mastery counts only the first try at each question.
    if (a.attemptNo === 1) {
      const m = applyAnswer(get().mastery[a.topicId] ?? emptyMastery(a.topicId, a.lessonId), a.correct, now);
      repo.saveMastery(m);
      set((s) => ({ mastery: { ...s.mastery, [a.topicId]: m } }));
    }
  },

  addStars(n, source) {
    if (n <= 0) return;
    repo.addStars(n, source);
    set((s) => ({ stars: s.stars + n }));
    get().checkRewards();
  },

  checkRewards() {
    const { progress, rewards, stars } = get();
    const has = (kind: string, id: string) => rewards.some((r) => r.kind === kind && r.rewardId === id);
    const now = Date.now();
    const earned: RewardRow[] = [];
    const queue: NonNullable<State['celebration']>[] = [];
    for (const w of worlds) {
      const done = w.lessons.every((l) => progress[l]?.status === 'completed');
      if (done && !has('badge', w.badge.id)) {
        earned.push({ kind: 'badge', rewardId: w.badge.id, at: now });
        queue.push({ badge: { title: w.badge.title, art: w.badge.art } });
      }
      const allThree = w.lessons.every((l) => (progress[l]?.stars ?? 0) >= 3);
      if (allThree && !has('trophy', w.id)) earned.push({ kind: 'trophy', rewardId: w.id, at: now });
    }
    const allDone = lessons.every((l) => progress[l.id]?.status === 'completed');
    const mockTaken = repo.getExams().some((e) => e.mode === 'mock' && e.finishedAt);
    if (allDone && mockTaken && !has('badge', PVS_STAR.id)) {
      earned.push({ kind: 'badge', rewardId: PVS_STAR.id, at: now });
      queue.push({ badge: { title: PVS_STAR.title, art: PVS_STAR.art } });
    }
    for (const u of unlockables) {
      if (u.stars > 0 && stars >= u.stars && !has('character', u.id)) {
        earned.push({ kind: 'character', rewardId: u.id, at: now });
        queue.push({ friend: u.id });
      }
    }
    if (earned.length) {
      earned.forEach((r) => repo.addReward(r));
      const all = [...get().celebrationQueue, ...queue];
      set({ rewards: repo.getRewards(), celebration: get().celebration ?? all[0] ?? null, celebrationQueue: get().celebration ? all : all.slice(1) });
    }
  },
  // Shows the next badge or friend, one at a time.
  clearCelebration: () => set((s) => ({ celebration: s.celebrationQueue[0] ?? null, celebrationQueue: s.celebrationQueue.slice(1) })),

  refreshPhotos: () => set({ photos: repo.getPhotos() }),
  refreshRecordings() {
    const recordings: Record<string, string> = {};
    repo.getRecordings().forEach((r) => (recordings[r.lineKey] = r.uri));
    set({ recordings });
    configureAudio({ recordings });
  },

  tickSeconds(sec) {
    const d = get().today.date === dayKey(Date.now()) ? get().today : freshDay();
    const next = { ...d, activeSeconds: d.activeSeconds + sec };
    repo.saveDay(next);
    set({ today: next });
  },
  touchLesson(id) {
    const d = get().today;
    if (d.lessonsTouched.includes(id)) return;
    const next = { ...d, lessonsTouched: [...d.lessonsTouched, id] };
    repo.saveDay(next);
    set({ today: next });
  },
  unlockExtraTime() {
    const next = { ...get().today, unlockedExtra: true, activeSeconds: 0 };
    repo.saveDay(next);
    set({ today: next });
  },

  resetProgress() {
    repo.resetProgress();
    set({ progress: {}, mastery: {}, stars: 0, rewards: [], today: freshDay() });
  },
  deleteEverything() {
    repo.deleteEverything();
    repo.setSetting('initialised', '1');
    set({ progress: {}, mastery: {}, stars: 0, rewards: [], photos: [], recordings: {}, name: '', settings: DEFAULTS, today: freshDay(), stack: [{ name: 'home' }] });
  },
}));

export const taughtLessons = (progress: Record<string, LessonProgress>) =>
  lessons.filter((l) => progress[l.id]?.taught).map((l) => l.id);

// The lesson Continue Learning opens: the first one not completed.
export function nextLesson(progress: Record<string, LessonProgress>) {
  const inProgress = lessons.find((l) => progress[l.id]?.status === 'in_progress');
  return inProgress ?? lessons.find((l) => progress[l.id]?.status !== 'completed') ?? lessons[0];
}

// A world is open when every lesson before it is taught (World 1 always open).
export function worldOpen(worldId: string, progress: Record<string, LessonProgress>) {
  if (useApp.getState().settings.unlockAll) return true;
  const idx = worlds.findIndex((w) => w.id === worldId);
  if (idx <= 0) return true;
  return worlds.slice(0, idx).every((w) => w.lessons.every((l) => progress[l]?.taught));
}

export const lessonOpen = (lessonId: string, progress: Record<string, LessonProgress>) => {
  if (useApp.getState().settings.unlockAll) return true;
  const i = lessons.findIndex((l) => l.id === lessonId);
  return i === 0 || !!progress[lessons[i - 1].id]?.taught || !!progress[lessonId]?.taught;
};

export const worldOf = worldOfLesson;
