// Web/test implementation: in memory. The Android app uses repo.native.ts (SQLite).
import type { DayRow, ExamSession, LessonProgress, PhotoRow, QuestionAttempt, RecordingRow, Repo, RewardRow, TopicMastery } from './types';

const s = {
  settings: new Map<string, string>(),
  photos: new Map<string, PhotoRow>(),
  progress: new Map<string, LessonProgress>(),
  attempts: [] as QuestionAttempt[],
  mastery: new Map<string, TopicMastery>(),
  exams: [] as ExamSession[],
  rewards: [] as RewardRow[],
  stars: [] as { amount: number; source: string }[],
  days: new Map<string, DayRow>(),
  recordings: new Map<string, RecordingRow>(),
};

export const repo: Repo = {
  init() {},
  getSetting: (k) => s.settings.get(k) ?? null,
  setSetting: (k, v) => void s.settings.set(k, v),
  getPhotos: () => [...s.photos.values()],
  savePhoto: (p) => void s.photos.set(p.kind, structuredClone(p)),
  deletePhoto: (k) => void s.photos.delete(k),
  getLessonProgress: () => [...s.progress.values()].map((p) => ({ ...p })),
  saveLessonProgress: (p) => void s.progress.set(p.lessonId, { ...p }),
  addAttempt: (a) => void s.attempts.push({ ...a }),
  getAttempts: () => s.attempts.map((a) => ({ ...a })),
  getMastery: () => [...s.mastery.values()].map((m) => ({ ...m })),
  saveMastery: (m) => void s.mastery.set(m.topicId, { ...m }),
  addExam: (e) => {
    const id = s.exams.length + 1;
    s.exams.push({ ...e, id });
    return id;
  },
  updateExam: (e) => {
    const i = s.exams.findIndex((x) => x.id === e.id);
    if (i >= 0) s.exams[i] = { ...e };
  },
  getExams: () => [...s.exams].reverse(),
  addReward: (r) => {
    if (!s.rewards.some((x) => x.kind === r.kind && x.rewardId === r.rewardId)) s.rewards.push(r);
  },
  getRewards: () => [...s.rewards],
  addStars: (amount, source) => void s.stars.push({ amount, source }),
  totalStars: () => s.stars.reduce((a, b) => a + b.amount, 0),
  getDay: (d) => s.days.get(d) ?? null,
  saveDay: (d) => void s.days.set(d.date, { ...d }),
  getDays: () => [...s.days.values()].sort((a, b) => b.date.localeCompare(a.date)),
  getRecordings: () => [...s.recordings.values()],
  saveRecording: (r) => void s.recordings.set(r.lineKey, r),
  deleteRecording: (k) => void s.recordings.delete(k),
  resetProgress: () => {
    s.progress.clear(); s.attempts = []; s.mastery.clear(); s.exams = []; s.rewards = []; s.stars = []; s.days.clear();
  },
  deleteEverything: () => {
    repo.resetProgress(); s.settings.clear(); s.photos.clear(); s.recordings.clear();
  },
};
