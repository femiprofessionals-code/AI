/**
 * Thin fetch wrapper over the FastAPI backend. All calls go through Next.js
 * rewrites (configured in next.config.js), so we use relative URLs and never
 * leak the backend host into the client bundle.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const detail =
      (typeof body === "object" && body && "detail" in body && String((body as any).detail)) ||
      res.statusText;
    throw new ApiError(res.status, detail, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

/**
 * SSE subscriber for /api/jobs/:id/stream.
 * Resolves once the job finishes (status: "done"|"failed").
 */
export function streamJob(
  jobId: number,
  onUpdate: (j: { status: string; progress: number; message: string; result?: unknown }) => void,
): Promise<{ status: string; result?: unknown }> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/jobs/${jobId}/stream`);
    es.addEventListener("update", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onUpdate(data);
        if (data.status === "done" || data.status === "failed") {
          es.close();
          resolve({ status: data.status, result: data.result });
        }
      } catch (err) {
        es.close();
        reject(err);
      }
    });
    es.addEventListener("error", () => {
      es.close();
      reject(new Error("stream error"));
    });
  });
}

// ---------- Types mirroring backend schemas ----------

export type Project = {
  id: number;
  name: string;
  topic: string;
  style: string;
  voice: string;
  created_at: string;
  updated_at: string;
};

export type Script = {
  id: number;
  project_id: number;
  hook: string;
  body: string;
  cta: string;
  raw: string;
};

export type Scene = {
  id: number;
  project_id: number;
  idx: number;
  narration: string;
  image_prompt: string;
  duration_sec: number;
  image_path: string | null;
  audio_path: string | null;
};

export type Health = {
  api: boolean;
  ollama: boolean;
  ollama_model_present: boolean;
  piper: boolean;
  whisper: boolean;
  ffmpeg: boolean;
  disk_free_gb: number;
};

export type Dashboard = {
  projects: number;
  videos: number;
  storage_bytes: number;
  queue_pending: number;
  queue_running: number;
};

export type Settings = {
  ollama_model: string;
  image_model: string;
  image_width: number;
  image_height: number;
  video_fps: number;
  video_width: number;
  video_height: number;
  projects_dir: string;
  models_dir: string;
};

export type VideoExport = {
  id: number;
  project_id: number;
  path: string;
  width: number;
  height: number;
  fps: number;
  duration_sec: number;
  size_bytes: number;
  created_at: string;
};
