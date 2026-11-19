import * as SQLite from 'expo-sqlite';
import type { DayRow, ExamSession, LessonProgress, PhotoRow, QuestionAttempt, RecordingRow, Repo, RewardRow, TopicMastery } from './types';

const MIGRATIONS: string[] = [
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE photos (kind TEXT PRIMARY KEY CHECK (kind IN ('full_body','face','hands','feet')), uri TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, updated_at INTEGER NOT NULL);
   CREATE TABLE body_markers (photo_kind TEXT NOT NULL REFERENCES photos(kind) ON DELETE CASCADE, part TEXT NOT NULL, x REAL, y REAL, radius REAL, PRIMARY KEY (photo_kind, part));
   CREATE TABLE lesson_progress (lesson_id TEXT PRIMARY KEY, status TEXT NOT NULL, current_stage INTEGER NOT NULL, taught INTEGER NOT NULL DEFAULT 0, stars INTEGER NOT NULL DEFAULT 0, first_completed_at INTEGER, last_opened_at INTEGER, times_completed INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE question_attempts (id INTEGER PRIMARY KEY, question_id TEXT NOT NULL, topic_id TEXT NOT NULL, lesson_id TEXT NOT NULL, context TEXT NOT NULL, exam_session_id INTEGER, chosen TEXT, is_correct INTEGER NOT NULL, attempt_no INTEGER NOT NULL, response_ms INTEGER, answered_at INTEGER NOT NULL);
   CREATE INDEX qa_topic ON question_attempts (topic_id, answered_at);
   CREATE TABLE topic_mastery (topic_id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, level INTEGER NOT NULL, box INTEGER NOT NULL, recent TEXT NOT NULL, total_attempts INTEGER NOT NULL, total_correct INTEGER NOT NULL, days_correct TEXT NOT NULL, last_seen_at INTEGER, next_due_at INTEGER);
   CREATE TABLE exam_sessions (id INTEGER PRIMARY KEY, mode TEXT NOT NULL, lessons TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, question_count INTEGER NOT NULL, correct_count INTEGER NOT NULL);
   CREATE TABLE rewards (kind TEXT NOT NULL, reward_id TEXT NOT NULL, earned_at INTEGER NOT NULL, PRIMARY KEY (kind, reward_id));
   CREATE TABLE star_ledger (id INTEGER PRIMARY KEY, amount INTEGER NOT NULL, source TEXT NOT NULL, earned_at INTEGER NOT NULL);
   CREATE TABLE daily_sessions (date TEXT PRIMARY KEY, active_seconds INTEGER NOT NULL, lessons_touched TEXT NOT NULL, finished INTEGER NOT NULL, unlocked_extra INTEGER NOT NULL);
   CREATE TABLE parent_recordings (line_key TEXT PRIMARY KEY, file_uri TEXT NOT NULL, recorded_at INTEGER NOT NULL);`,
];

let db: SQLite.SQLiteDatabase;

const PROGRESS_TABLES = ['lesson_progress', 'question_attempts', 'topic_mastery', 'exam_sessions', 'rewards', 'star_ledger', 'daily_sessions'];

export const repo: Repo = {
  init() {
    db = SQLite.openDatabaseSync('little-learning-world.db');
    db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const v = db.getFirstSync<{ user_version: number }>('PRAGMA user_version')!.user_version;
    for (let i = v; i < MIGRATIONS.length; i++) {
      db.withTransactionSync(() => {
        db.execSync(MIGRATIONS[i]);
        db.execSync(`PRAGMA user_version = ${i + 1}`);
      });
    }
  },
  getSetting(key) {
    return db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
  },
  setSetting(key, value) {
    db.runSync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  },
  getPhotos() {
    const rows = db.getAllSync<any>('SELECT * FROM photos');
    return rows.map((r) => {
      const markers: PhotoRow['markers'] = {};
      for (const m of db.getAllSync<any>('SELECT * FROM body_markers WHERE photo_kind = ?', r.kind)) {
        markers[m.part] = m.x == null ? null : { x: m.x, y: m.y, r: m.radius };
      }
      return { kind: r.kind, uri: r.uri, width: r.width, height: r.height, updatedAt: r.updated_at, markers };
    });
  },
  savePhoto(p) {
    db.withTransactionSync(() => {
      db.runSync(
        'INSERT INTO photos (kind, uri, width, height, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(kind) DO UPDATE SET uri = excluded.uri, width = excluded.width, height = excluded.height, updated_at = excluded.updated_at',
        p.kind, p.uri, p.width, p.height, p.updatedAt,
      );
      db.runSync('DELETE FROM body_markers WHERE photo_kind = ?', p.kind);
      for (const [part, m] of Object.entries(p.markers)) {
        db.runSync('INSERT INTO body_markers (photo_kind, part, x, y, radius) VALUES (?, ?, ?, ?, ?)', p.kind, part, m?.x ?? null, m?.y ?? null, m?.r ?? null);
      }
    });
  },
  deletePhoto(kind) {
    db.runSync('DELETE FROM photos WHERE kind = ?', kind);
  },
  getLessonProgress() {
    return db.getAllSync<any>('SELECT * FROM lesson_progress').map((r) => ({
      lessonId: r.lesson_id, status: r.status, stage: r.current_stage, taught: !!r.taught, stars: r.stars,
      firstCompletedAt: r.first_completed_at, lastOpenedAt: r.last_opened_at, timesCompleted: r.times_completed,
    }));
  },
  saveLessonProgress(p: LessonProgress) {
    db.runSync(
      `INSERT INTO lesson_progress (lesson_id, status, current_stage, taught, stars, first_completed_at, last_opened_at, times_completed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(lesson_id) DO UPDATE SET status = excluded.status, current_stage = excluded.current_stage, taught = excluded.taught, stars = excluded.stars,
       first_completed_at = excluded.first_completed_at, last_opened_at = excluded.last_opened_at, times_completed = excluded.times_completed`,
      p.lessonId, p.status, p.stage, p.taught ? 1 : 0, p.stars, p.firstCompletedAt, p.lastOpenedAt, p.timesCompleted,
    );
  },
  addAttempt(a: QuestionAttempt) {
    db.runSync(
      'INSERT INTO question_attempts (question_id, topic_id, lesson_id, context, exam_session_id, chosen, is_correct, attempt_no, response_ms, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      a.questionId, a.topicId, a.lessonId, a.context, a.examId, a.chosen, a.correct ? 1 : 0, a.attemptNo, a.responseMs, a.at,
    );
  },
  getAttempts() {
    return db.getAllSync<any>('SELECT * FROM question_attempts ORDER BY answered_at').map((r) => ({
      questionId: r.question_id, topicId: r.topic_id, lessonId: r.lesson_id, context: r.context, examId: r.exam_session_id,
      chosen: r.chosen, correct: !!r.is_correct, attemptNo: r.attempt_no, responseMs: r.response_ms, at: r.answered_at,
    }));
  },
  getMastery() {
    return db.getAllSync<any>('SELECT * FROM topic_mastery').map((r) => ({
      topicId: r.topic_id, lessonId: r.lesson_id, level: r.level, box: r.box, recent: r.recent, totalAttempts: r.total_attempts,
      totalCorrect: r.total_correct, daysCorrect: r.days_correct, lastSeenAt: r.last_seen_at, nextDueAt: r.next_due_at,
    }));
  },
  saveMastery(m: TopicMastery) {
    db.runSync(
      `INSERT INTO topic_mastery (topic_id, lesson_id, level, box, recent, total_attempts, total_correct, days_correct, last_seen_at, next_due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(topic_id) DO UPDATE SET level = excluded.level, box = excluded.box, recent = excluded.recent, total_attempts = excluded.total_attempts,
       total_correct = excluded.total_correct, days_correct = excluded.days_correct, last_seen_at = excluded.last_seen_at, next_due_at = excluded.next_due_at`,
      m.topicId, m.lessonId, m.level, m.box, m.recent, m.totalAttempts, m.totalCorrect, m.daysCorrect, m.lastSeenAt, m.nextDueAt,
    );
  },
  addExam(e: ExamSession) {
    const r = db.runSync('INSERT INTO exam_sessions (mode, lessons, started_at, finished_at, question_count, correct_count) VALUES (?, ?, ?, ?, ?, ?)', e.mode, JSON.stringify(e.lessons), e.startedAt, e.finishedAt, e.total, e.correct);
    return r.lastInsertRowId;
  },
  updateExam(e: ExamSession) {
    db.runSync('UPDATE exam_sessions SET finished_at = ?, question_count = ?, correct_count = ? WHERE id = ?', e.finishedAt, e.total, e.correct, e.id!);
  },
  getExams() {
    return db.getAllSync<any>('SELECT * FROM exam_sessions ORDER BY started_at DESC').map((r) => ({
      id: r.id, mode: r.mode, lessons: JSON.parse(r.lessons), startedAt: r.started_at, finishedAt: r.finished_at, total: r.question_count, correct: r.correct_count,
    }));
  },
  addReward(r: RewardRow) {
    db.runSync('INSERT OR IGNORE INTO rewards (kind, reward_id, earned_at) VALUES (?, ?, ?)', r.kind, r.rewardId, r.at);
  },
  getRewards() {
    return db.getAllSync<any>('SELECT * FROM rewards').map((r) => ({ kind: r.kind, rewardId: r.reward_id, at: r.earned_at }));
  },
  addStars(amount, source) {
    db.runSync('INSERT INTO star_ledger (amount, source, earned_at) VALUES (?, ?, ?)', amount, source, Date.now());
  },
  totalStars() {
    return db.getFirstSync<{ t: number }>('SELECT COALESCE(SUM(amount), 0) AS t FROM star_ledger')!.t;
  },
  getDay(date) {
    const r = db.getFirstSync<any>('SELECT * FROM daily_sessions WHERE date = ?', date);
    return r ? { date: r.date, activeSeconds: r.active_seconds, lessonsTouched: JSON.parse(r.lessons_touched), finished: !!r.finished, unlockedExtra: !!r.unlocked_extra } : null;
  },
  saveDay(d: DayRow) {
    db.runSync(
      `INSERT INTO daily_sessions (date, active_seconds, lessons_touched, finished, unlocked_extra) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET active_seconds = excluded.active_seconds, lessons_touched = excluded.lessons_touched, finished = excluded.finished, unlocked_extra = excluded.unlocked_extra`,
      d.date, d.activeSeconds, JSON.stringify(d.lessonsTouched), d.finished ? 1 : 0, d.unlockedExtra ? 1 : 0,
    );
  },
  getDays() {
    return db.getAllSync<any>('SELECT * FROM daily_sessions ORDER BY date DESC LIMIT 60').map((r) => ({
      date: r.date, activeSeconds: r.active_seconds, lessonsTouched: JSON.parse(r.lessons_touched), finished: !!r.finished, unlockedExtra: !!r.unlocked_extra,
    }));
  },
  getRecordings() {
    return db.getAllSync<any>('SELECT * FROM parent_recordings').map((r) => ({ lineKey: r.line_key, uri: r.file_uri, at: r.recorded_at }));
  },
  saveRecording(r: RecordingRow) {
    db.runSync('INSERT INTO parent_recordings (line_key, file_uri, recorded_at) VALUES (?, ?, ?) ON CONFLICT(line_key) DO UPDATE SET file_uri = excluded.file_uri, recorded_at = excluded.recorded_at', r.lineKey, r.uri, r.at);
  },
  deleteRecording(lineKey) {
    db.runSync('DELETE FROM parent_recordings WHERE line_key = ?', lineKey);
  },
  resetProgress() {
    db.withTransactionSync(() => PROGRESS_TABLES.forEach((t) => db.execSync(`DELETE FROM ${t}`)));
  },
  deleteEverything() {
    db.withTransactionSync(() => {
      [...PROGRESS_TABLES, 'parent_recordings', 'body_markers', 'photos', 'settings'].forEach((t) => db.execSync(`DELETE FROM ${t}`));
    });
  },
};
