import { convertFileSrc } from "@tauri-apps/api/core";

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms)) return "–";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return (h > 0 ? `${h}:` : "") + `${mm}:${String(s).padStart(2, "0")}`;
}

export function formatSeconds(ms: number): string {
  const s = ms / 1000;
  return `${s % 1 === 0 ? s.toFixed(0) : s.toFixed(1)}s`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  if (diff < 7 * 86400) return `${Math.round(diff / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatClock(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** URL the webview can load for a local file (Tauri asset protocol). */
export function fileUrl(path: string | null | undefined, version?: string | number): string | undefined {
  if (!path) return undefined;
  const url = convertFileSrc(path);
  return version != null ? `${url}?v=${encodeURIComponent(String(version))}` : url;
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_progress: "In progress",
  review: "In review",
  complete: "Complete",
};

export const KIND_LABEL: Record<string, string> = {
  conversation: "Gospel Conversation",
  hypeman: "Gospel Hypeman",
};
