import { invoke } from "@tauri-apps/api/core";
import type {
  AppInfo, Dashboard, EngineInfo, GenerateResult, ImportResult, MediaItem, MediaKind, Project,
  ProjectKind, RenderJob, Revision, Scene, SceneInput, ScriptDoc, Settings, Speaker, SystemStatus,
} from "./types";

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    if (e && typeof e === "object" && "message" in e) {
      const err = e as { code?: string; message: string };
      throw new ApiError(err.code ?? "error", err.message);
    }
    throw new ApiError("error", String(e));
  }
}

export const api = {
  appInfo: () => call<AppInfo>("app_info"),
  systemStatus: (refresh = false) => call<SystemStatus>("system_status", { refresh }),
  openPath: (path: string, reveal = false) => call<void>("open_path", { path, reveal }),

  settingsGet: () => call<Settings>("settings_get"),
  settingsSave: (settings: Settings) => call<Settings>("settings_save", { settings }),
  dbBackup: () => call<string>("db_backup"),

  dashboard: () => call<Dashboard>("dashboard"),

  projectsList: (query: { kind?: ProjectKind; includeArchived?: boolean; search?: string; limit?: number }) =>
    call<Project[]>("projects_list", { query }),
  projectGet: (id: string) => call<Project>("project_get", { id }),
  projectCreate: (input: { kind: ProjectKind; title: string; description?: string; aspectRatio?: string }) =>
    call<Project>("project_create", { input }),
  projectUpdate: (id: string, input: Partial<{
    title: string; description: string; status: string; aspectRatio: string; bpm: number;
    targetSeconds: number; musicMediaId: string; musicVolume: number;
  }>) => call<Project>("project_update", { id, input }),
  projectSetArchived: (id: string, archived: boolean) => call<Project>("project_set_archived", { id, archived }),
  projectDelete: (id: string, deleteFiles: boolean) => call<boolean>("project_delete", { id, deleteFiles }),

  scriptGet: (projectId: string) => call<ScriptDoc>("script_get", { projectId }),
  scriptSave: (projectId: string, content: string) => call<ScriptDoc>("script_save", { projectId, content }),
  scriptSnapshot: (projectId: string) => call<Revision[]>("script_snapshot", { projectId }),
  scriptRevisions: (projectId: string) => call<Revision[]>("script_revisions", { projectId }),
  scriptRevisionContent: (revisionId: number) => call<string>("script_revision_content", { revisionId }),
  scriptRestore: (projectId: string, revisionId: number) => call<ScriptDoc>("script_restore", { projectId, revisionId }),

  speakersList: (projectId: string) => call<Speaker[]>("speakers_list", { projectId }),
  speakerCreate: (projectId: string, input: { name: string; role?: string; color?: string }) =>
    call<Speaker>("speaker_create", { projectId, input }),
  speakerUpdate: (id: string, input: { name: string; role?: string; color?: string }) =>
    call<Speaker>("speaker_update", { id, input }),
  speakerDelete: (id: string) => call<void>("speaker_delete", { id }),

  scenesList: (projectId: string) => call<Scene[]>("scenes_list", { projectId }),
  sceneCreate: (projectId: string, input: SceneInput, afterPosition?: number) =>
    call<Scene>("scene_create", { projectId, input, afterPosition }),
  sceneUpdate: (id: string, input: SceneInput) => call<Scene>("scene_update", { id, input }),
  sceneDelete: (id: string) => call<void>("scene_delete", { id }),
  sceneDuplicate: (id: string) => call<Scene>("scene_duplicate", { id }),
  scenesReorder: (projectId: string, orderedIds: string[]) => call<Scene[]>("scenes_reorder", { projectId, orderedIds }),
  scenesGenerate: (projectId: string, replace: boolean) => call<GenerateResult>("scenes_generate", { projectId, replace }),

  mediaList: (query: { kind?: MediaKind; search?: string }) => call<MediaItem[]>("media_list", { query }),
  mediaImport: (paths: string[]) => call<ImportResult>("media_import", { paths }),
  mediaUpdate: (id: string, input: { title?: string; tags?: string }) => call<MediaItem>("media_update", { id, input }),
  mediaReprocess: (id: string) => call<MediaItem>("media_reprocess", { id }),
  mediaDelete: (id: string) => call<void>("media_delete", { id }),

  enginesList: () => call<EngineInfo[]>("engines_list"),
  renderStart: (projectId: string, engineId: string, options: Record<string, unknown>) =>
    call<RenderJob>("render_start", { projectId, engineId, options }),
  jobsList: (projectId?: string) => call<RenderJob[]>("jobs_list", { projectId }),
  jobCancel: (id: string) => call<RenderJob>("job_cancel", { id }),
  jobDelete: (id: string) => call<void>("job_delete", { id }),
};

export const EVENTS = {
  media: "media-updated",
  job: "render-job-updated",
} as const;
