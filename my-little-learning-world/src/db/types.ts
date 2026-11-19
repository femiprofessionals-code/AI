export type PhotoKind = 'full_body' | 'face' | 'hands' | 'feet';
export type Marker = { x: number; y: number; r: number };
export type PhotoRow = { kind: PhotoKind; uri: string; width: number; height: number; markers: Record<string, Marker | null>; updatedAt: number };

export type LessonProgress = {
  lessonId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  stage: number; // 1..7, the stage to resume at
  taught: boolean; // Listen and Learn finished, so exams may use this lesson
  stars: number;
  firstCompletedAt: number | null;
  lastOpenedAt: number | null;
  timesCompleted: number;
};

export type AttemptContext = 'recap' | 'lesson_exam' | 'practice' | 'revision' | 'mock' | 'picture' | 'oral' | 'game';

export type QuestionAttempt = {
  questionId: string;
  topicId: string;
  lessonId: string;
  context: AttemptContext;
  examId: number | null;
  chosen: string | null;
  correct: boolean;
  attemptNo: number;
  responseMs: number | null;
  at: number;
};

export type TopicMastery = {
  topicId: string;
  lessonId: string;
  level: 0 | 1 | 2 | 3;
  box: number; // 1..5
  recent: string; // last 5 results, '1' correct '0' wrong
  totalAttempts: number;
  totalCorrect: number;
  daysCorrect: string; // comma list of yyyy-mm-dd on which a first-try correct happened (last 5)
  lastSeenAt: number | null;
  nextDueAt: number | null;
};

export type ExamSession = {
  id?: number;
  mode: string;
  lessons: string[];
  startedAt: number;
  finishedAt: number | null;
  total: number;
  correct: number;
};

export type RewardRow = { kind: 'badge' | 'trophy' | 'character'; rewardId: string; at: number };
export type DayRow = { date: string; activeSeconds: number; lessonsTouched: string[]; finished: boolean; unlockedExtra: boolean };
export type RecordingRow = { lineKey: string; uri: string; at: number };

export interface Repo {
  init(): void;
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
  getPhotos(): PhotoRow[];
  savePhoto(p: PhotoRow): void;
  deletePhoto(kind: PhotoKind): void;
  getLessonProgress(): LessonProgress[];
  saveLessonProgress(p: LessonProgress): void;
  addAttempt(a: QuestionAttempt): void;
  getAttempts(): QuestionAttempt[];
  getMastery(): TopicMastery[];
  saveMastery(m: TopicMastery): void;
  addExam(e: ExamSession): number;
  updateExam(e: ExamSession): void;
  getExams(): ExamSession[];
  addReward(r: RewardRow): void;
  getRewards(): RewardRow[];
  addStars(amount: number, source: string): void;
  totalStars(): number;
  getDay(date: string): DayRow | null;
  saveDay(d: DayRow): void;
  getDays(): DayRow[];
  getRecordings(): RecordingRow[];
  saveRecording(r: RecordingRow): void;
  deleteRecording(lineKey: string): void;
  resetProgress(): void;
  deleteEverything(): void;
}
