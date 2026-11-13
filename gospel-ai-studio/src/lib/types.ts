// Mirrors the Rust structs (serde camelCase).

export type ProjectKind = "conversation" | "hypeman";
export type ProjectStatus = "draft" | "in_progress" | "review" | "complete";
export type AspectRatio = "16:9" | "9:16" | "1:1";
export type MediaKind = "image" | "video" | "audio";

export interface Project {
  id: string;
  kind: ProjectKind;
  title: string;
  description: string;
  status: ProjectStatus;
  aspectRatio: AspectRatio;
  folderPath: string;
  bpm: number | null;
  targetSeconds: number | null;
  musicMediaId: string | null;
  musicVolume: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  sceneCount: number;
  wordCount: number;
  totalDurationMs: number;
}

export interface ScriptDoc {
  projectId: string;
  content: string;
  wordCount: number;
  updatedAt: string;
}

export interface Revision {
  id: number;
  wordCount: number;
  reason: "auto" | "manual" | "before_restore";
  createdAt: string;
  preview: string;
}

export interface Speaker {
  id: string;
  projectId: string;
  name: string;
  role: string;
  color: string;
  sortOrder: number;
  sceneCount: number;
}

export interface Scene {
  id: string;
  projectId: string;
  position: number;
  title: string;
  scriptText: string;
  speakerId: string | null;
  speakerName: string | null;
  speakerColor: string | null;
  visualMediaId: string | null;
  visualKind: MediaKind | null;
  visualTitle: string | null;
  visualThumbnail: string | null;
  visualPath: string | null;
  audioMediaId: string | null;
  audioTitle: string | null;
  audioDurationMs: number | null;
  audioPath: string | null;
  durationMs: number;
  notes: string;
  updatedAt: string;
}

/** Fields omitted are unchanged; "" clears a reference. */
export interface SceneInput {
  title?: string;
  scriptText?: string;
  speakerId?: string;
  visualMediaId?: string;
  audioMediaId?: string;
  durationMs?: number;
  notes?: string;
}

export interface MediaItem {
  id: string;
  kind: MediaKind;
  title: string;
  originalName: string;
  filePath: string;
  managed: boolean;
  fileSize: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  thumbnailPath: string | null;
  probeStatus: "pending" | "ready" | "failed";
  tags: string;
  createdAt: string;
  usageCount: number;
  fileMissing: boolean;
}

export interface Settings {
  workspaceRoot: string;
  ffmpegPath: string;
  importMode: "copy" | "link";
  autosaveDelayMs: number;
  wordsPerMinuteConversation: number;
  wordsPerMinuteHypeman: number;
  defaultAspectConversation: AspectRatio;
  defaultAspectHypeman: AspectRatio;
  renderQuality: "720p" | "1080p";
  renderThreads: number;
  renderFontPath: string;
  theme: "system" | "dark" | "light";
}

export interface SystemStatus {
  ffmpegFound: boolean;
  ffmpegPath: string | null;
  ffmpegVersion: string | null;
  ffprobeFound: boolean;
  fontFound: boolean;
  workspaceWritable: boolean;
  pendingMedia: number;
}

export interface AppInfo {
  version: string;
  dbPath: string;
  schemaVersion: number;
  workspaceRoot: string;
  platform: string;
  cpuThreads: number;
}

export interface EngineInfo {
  id: string;
  name: string;
  description: string;
  usesAi: boolean;
  available: boolean;
  unavailableReason: string | null;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface RenderJob {
  id: string;
  projectId: string;
  projectTitle: string;
  engineId: string;
  options: Record<string, unknown>;
  status: JobStatus;
  progress: number;
  message: string;
  outputPath: string | null;
  outputExists: boolean;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Dashboard {
  conversationCount: number;
  hypemanCount: number;
  sceneCount: number;
  library: { images: number; videos: number; audio: number; totalBytes: number };
  recentProjects: Project[];
  recentJobs: RenderJob[];
}

export interface ImportResult {
  imported: MediaItem[];
  skipped: string[];
}

export interface GenerateResult {
  created: number;
  speakersCreated: number;
  scenes: Scene[];
}
