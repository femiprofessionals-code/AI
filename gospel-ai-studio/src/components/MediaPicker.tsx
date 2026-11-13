import { useState } from "react";
import { Search, Upload, Music, Film, Image as ImageIcon, Ban } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Modal } from "./Modal";
import { api, EVENTS } from "../lib/api";
import { useLoad } from "../hooks/useLoad";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { useToast } from "./Toasts";
import { Spinner } from "./Common";
import { fileUrl, formatDuration } from "../lib/format";
import type { MediaItem, MediaKind } from "../lib/types";

const FILTERS: Record<string, { name: string; extensions: string[] }> = {
  image: { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif"] },
  video: { name: "Video", extensions: ["mp4", "mov", "mkv", "webm", "avi", "m4v"] },
  audio: { name: "Audio", extensions: ["mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"] },
};

export function MediaThumb({ item, size = "md" }: { item: Pick<MediaItem, "kind" | "thumbnailPath" | "title"> & { probeStatus?: string }; size?: "sm" | "md" }) {
  const Icon = item.kind === "audio" ? Music : item.kind === "video" ? Film : ImageIcon;
  return (
    <div className={`thumb thumb-${size} thumb-${item.kind}`}>
      {item.thumbnailPath ? <img src={fileUrl(item.thumbnailPath)} alt="" loading="lazy" draggable={false} /> : <Icon size={size === "sm" ? 16 : 26} />}
      {item.kind === "video" && item.thumbnailPath && <span className="thumb-badge"><Film size={11} /></span>}
    </div>
  );
}

export function MediaPicker({ kinds, title, current, onPick, onClose }: {
  kinds: MediaKind[]; title: string; current?: string | null; onPick: (id: string | null) => void; onClose: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const { data, setData, loading } = useLoad(async () => {
    const all = await api.mediaList({ kind: kinds.length === 1 ? kinds[0] : undefined });
    return all.filter((m) => kinds.includes(m.kind));
  }, [kinds.join(",")]);
  useTauriEvent<MediaItem>(EVENTS.media, (m) => setData((d) => d?.map((x) => (x.id === m.id ? m : x))));

  const importFiles = async () => {
    const picked = await open({ multiple: true, filters: kinds.map((k) => FILTERS[k]) });
    if (!picked) return;
    try {
      const r = await api.mediaImport(Array.isArray(picked) ? picked : [picked]);
      setData((d) => [...r.imported.filter((m) => kinds.includes(m.kind)), ...(d ?? [])]);
      if (r.skipped.length) toast.info(`Skipped: ${r.skipped.join("; ")}`);
      if (r.imported.length === 1) onPick(r.imported[0].id);
    } catch (e) {
      toast.error(e);
    }
  };

  const q = search.trim().toLowerCase();
  const list = (data ?? []).filter((m) => !q || m.title.toLowerCase().includes(q) || m.tags.includes(q));

  return (
    <Modal title={title} onClose={onClose} wide
      footer={<>
        {current && <button className="btn" onClick={() => onPick(null)}><Ban size={15} /> Remove</button>}
        <div className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
      </>}>
      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input autoFocus placeholder="Search library" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button className="btn" onClick={importFiles}><Upload size={15} /> Import files…</button>
      </div>
      {loading && !data ? <Spinner /> : list.length === 0 ? (
        <p className="muted pad">No {kinds.join(" or ")} files in your library yet. Use “Import files…” to add some.</p>
      ) : (
        <div className="picker-grid">
          {list.map((m) => (
            <button key={m.id} className={`picker-item ${current === m.id ? "selected" : ""}`} onClick={() => onPick(m.id)} title={m.originalName}>
              <MediaThumb item={m} />
              <span className="picker-title">{m.title}</span>
              <span className="muted small">{m.durationMs ? formatDuration(m.durationMs) : m.width ? `${m.width}×${m.height}` : m.kind}{m.fileMissing ? " · missing" : ""}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
