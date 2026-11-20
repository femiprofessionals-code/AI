// Storage for the WebView build (and the browser test suite).
// Everything lives in one JSON document in localStorage, saved after every
// change, so progress survives closing the app. The React Native build uses
// repo.native.ts (SQLite) instead.
import type { DayRow, ExamSession, LessonProgress, PhotoRow, QuestionAttempt, RecordingRow, Repo, RewardRow, TopicMastery } from './types';

const KEY = 'mllw-data-v1';

type Data = {
  settings: Record<string, string>;
  photos: Record<string, PhotoRow>;
  progress: Record<string, LessonProgress>;
  attempts: QuestionAttempt[];
  mastery: Record<string, TopicMastery>;
  exams: ExamSession[];
  rewards: RewardRow[];
  stars: { amount: number; source: string; at: number }[];
  days: Record<string, DayRow>;
  recordings: Record<string, RecordingRow>;
};

const empty = (): Data => ({ settings: {}, photos: {}, progress: {}, attempts: [], mastery: {}, exams: [], rewards: [], stars: [], days: {}, recordings: {} });
let d: Data = empty();

function storage(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}
function save() {
  try { storage()?.setItem(KEY, JSON.stringify(d)); } catch (e) { console.warn('[repo] save failed', e); }
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export const repo: Repo = {
  init() {
    try {
      const raw = storage()?.getItem(KEY);
      if (raw) d = { ...empty(), ...JSON.parse(raw) };
    } catch (e) {
      console.warn('[repo] could not read saved data, starting fresh', e);
      d = empty();
    }
  },
  getSetting: (k) => d.settings[k] ?? null,
  setSetting: (k, v) => { d.settings[k] = v; save(); },
  getPhotos: () => clone(Object.values(d.photos)),
  savePhoto: (p) => { d.photos[p.kind] = clone(p); save(); },
  deletePhoto: (k) => { delete d.photos[k]; save(); },
  getLessonProgress: () => clone(Object.values(d.progress)),
  saveLessonProgress: (p) => { d.progress[p.lessonId] = { ...p }; save(); },
  addAttempt: (a) => { d.attempts.push({ ...a }); if (d.attempts.length > 5000) d.attempts.splice(0, d.attempts.length - 5000); save(); },
  getAttempts: () => clone(d.attempts),
  getMastery: () => clone(Object.values(d.mastery)),
  saveMastery: (m) => { d.mastery[m.topicId] = { ...m }; save(); },
  addExam: (e) => {
    const id = (d.exams.reduce((m, x) => Math.max(m, x.id ?? 0), 0) || 0) + 1;
    d.exams.push({ ...e, id });
    save();
    return id;
  },
  updateExam: (e) => {
    const i = d.exams.findIndex((x) => x.id === e.id);
    if (i >= 0) { d.exams[i] = { ...d.exams[i], ...e, startedAt: d.exams[i].startedAt, lessons: e.lessons.length ? e.lessons : d.exams[i].lessons }; save(); }
  },
  getExams: () => clone(d.exams).sort((a, b) => b.startedAt - a.startedAt),
  addReward: (r) => {
    if (!d.rewards.some((x) => x.kind === r.kind && x.rewardId === r.rewardId)) { d.rewards.push(r); save(); }
  },
  getRewards: () => clone(d.rewards),
  addStars: (amount, source) => { d.stars.push({ amount, source, at: Date.now() }); save(); },
  totalStars: () => d.stars.reduce((a, b) => a + b.amount, 0),
  getDay: (day) => (d.days[day] ? clone(d.days[day]) : null),
  saveDay: (x) => { d.days[x.date] = clone(x); save(); },
  getDays: () => clone(Object.values(d.days)).sort((a, b) => b.date.localeCompare(a.date)),
  getRecordings: () => clone(Object.values(d.recordings)),
  saveRecording: (r) => { d.recordings[r.lineKey] = r; save(); },
  deleteRecording: (k) => { delete d.recordings[k]; save(); },
  resetProgress: () => {
    d = { ...empty(), settings: d.settings, photos: d.photos, recordings: d.recordings };
    save();
  },
  deleteEverything: () => { d = empty(); save(); },
};
