import { useEffect, useState } from "react";
import { Upload, Search, FolderOpen, RefreshCw, Trash2, Images, Link2, Loader2, AlertTriangle, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { api, EVENTS } from "../lib/api";
import { useApp } from "../lib/appContext";
import { useLoad } from "../hooks/useLoad";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { useToast } from "../components/Toasts";
import { useConfirm } from "../components/Confirm";
import { EmptyState, ErrorBox, PageHeader, Spinner } from "../components/Common";
import { MediaThumb } from "../components/MediaPicker";
import { fileUrl, formatBytes, formatDuration, formatWhen } from "../lib/format";
import type { MediaItem, MediaKind } from "../lib/types";

export const MEDIA_FILTERS = [
  { name: "All supported media", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif", "mp4", "mov", "mkv", "webm", "avi", "m4v", "mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"] },
  { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif"] },
  { name: "Video", extensions: ["mp4", "mov", "mkv", "webm", "avi", "m4v"] },
  { name: "Audio", extensions: ["mp3", "wav", "m4a", "aac", "ogg", "flac", "opus"] },
];

const KINDS: { key: MediaKind | ""; label: string }[] = [
  { key: "", label: "All" }, { key: "image", label: "Images" }, { key: "video", label: "Video" }, { key: "audio", label: "Audio" },
];

export function MediaLibraryPage() {
  const toast = useToast();
  const { settings, status } = useApp();
  const [kind, setKind] = useState<MediaKind | "">("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(search), 200); return () => clearTimeout(t); }, [search]);
  const { data, setData, error, loading, reload } = useLoad(() => api.mediaList({ kind: kind || undefined, search: debounced }), [kind, debounced]);

  useTauriEvent<MediaItem>(EVENTS.media, (m) => setData((d) => d?.map((x) => (x.id === m.id ? m : x))));

  const doImport = async (paths: string[]) => {
    if (paths.length === 0) return;
    setImporting(true);
    try {
      const r = await api.mediaImport(paths);
      if (r.imported.length) toast.success(`Imported ${r.imported.length} file${r.imported.length === 1 ? "" : "s"}`);
      if (r.skipped.length) toast.info(`Skipped ${r.skipped.length}: ${r.skipped.join("; ")}`);
      await reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setImporting(false);
    }
  };

  // Drag files from Explorer onto the window.
  useEffect(() => {
    let un: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((e) => {
        if (e.payload.type === "over" || e.payload.type === "enter") setDragging(true);
        else if (e.payload.type === "leave") setDragging(false);
        else if (e.payload.type === "drop") {
          setDragging(false);
          void doImport(e.payload.paths);
        }
      })
      .then((u) => (un = u))
      .catch(() => {});
    return () => un?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async () => {
    const picked = await open({ multiple: true, filters: MEDIA_FILTERS });
    if (picked) void doImport(Array.isArray(picked) ? picked : [picked]);
  };

  const selected = data?.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="page library">
      <PageHeader
        title="Media Library"
        subtitle={<>Images, video clips, voice recordings and music shared by all projects. {settings?.importMode === "link" ? "Files are linked in place." : "Imports are copied into your workspace’s Library folder."}</>}
        actions={<button className="btn btn-primary" onClick={pick} disabled={importing}>{importing ? <Loader2 size={16} className="spin" /> : <Upload size={16} />} Import files</button>}
      />
      {!status?.ffmpegFound && status != null && (
        <div className="notice notice-warn"><AlertTriangle size={16} /> FFmpeg was not found, so thumbnails and durations can’t be read yet. Files still import; they’ll be processed once FFmpeg is set up in Settings.</div>
      )}
      <div className="toolbar">
        <div className="seg">
          {KINDS.map((k) => <button key={k.key} className={`seg-btn ${kind === k.key ? "on" : ""}`} onClick={() => setKind(k.key)}>{k.label}</button>)}
        </div>
        <label className="search">
          <Search size={16} />
          <input placeholder="Search title, file name or tag" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        {settings && <button className="btn" onClick={() => api.openPath(`${settings.workspaceRoot}`).catch(toast.error)}><FolderOpen size={15} /> Workspace folder</button>}
      </div>

      <div className={`library-body ${selected ? "with-detail" : ""}`}>
        <div className="library-grid-wrap">
          {error && <ErrorBox message={error} onRetry={reload} />}
          {loading && !data ? <Spinner /> : data && data.length === 0 ? (
            <EmptyState icon={<Images size={30} />} title={debounced || kind ? "Nothing matches" : "Your library is empty"}
              action={!debounced && !kind ? <button className="btn btn-primary" onClick={pick}><Upload size={16} /> Import files</button> : undefined}>
              {!debounced && !kind ? "Click Import, or drag files from File Explorer onto this window." : "Try another filter or search."}
            </EmptyState>
          ) : (
            <div className="media-grid">
              {data?.map((m) => (
                <button key={m.id} className={`media-card ${selectedId === m.id ? "selected" : ""}`} onClick={() => setSelectedId(m.id)}>
                  <MediaThumb item={m} />
                  <div className="media-card-body">
                    <span className="media-title">{m.title}</span>
                    <span className="muted small">
                      {m.probeStatus === "pending" ? "Processing…" : m.durationMs ? formatDuration(m.durationMs) : m.width ? `${m.width}×${m.height}` : m.kind}
                      {!m.managed && " · linked"}
                      {m.fileMissing && " · missing"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <MediaDetail key={selected.id} item={selected} onClose={() => setSelectedId(null)}
            onChange={(m) => setData((d) => d?.map((x) => (x.id === m.id ? m : x)))}
            onDeleted={() => { setData((d) => d?.filter((x) => x.id !== selected.id)); setSelectedId(null); }} />
        )}
      </div>
      {dragging && <div className="drop-overlay"><Upload size={36} /><span>Drop files to import</span></div>}
    </div>
  );
}

function MediaDetail({ item, onClose, onChange, onDeleted }: { item: MediaItem; onClose: () => void; onChange: (m: MediaItem) => void; onDeleted: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [title, setTitle] = useState(item.title);
  const [tags, setTags] = useState(item.tags);

  const save = async (patch: { title?: string; tags?: string }) => {
    try {
      const m = await api.mediaUpdate(item.id, patch);
      onChange(m);
      setTitle(m.title);
      setTags(m.tags);
    } catch (e) {
      toast.error(e);
      setTitle(item.title);
    }
  };
  const remove = async () => {
    const r = await confirm({
      title: "Remove from library?",
      message: <>
        {item.usageCount > 0 && <p><strong>Used in {item.usageCount} place{item.usageCount === 1 ? "" : "s"}.</strong> Those scenes will lose this media.</p>}
        <p>{item.managed ? "The copy in your Library folder will be deleted." : "This file is linked, so the original file on disk is not touched."}</p>
      </>,
      confirmLabel: "Remove", danger: true,
    });
    if (!r.ok) return;
    try {
      await api.mediaDelete(item.id);
      onDeleted();
    } catch (e) {
      toast.error(e);
    }
  };
  const reprocess = async () => {
    try {
      onChange(await api.mediaReprocess(item.id));
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <aside className="media-detail panel">
      <div className="panel-head">
        <h2 className="ellipsis">{item.title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close details"><X size={16} /></button>
      </div>
      <div className="detail-preview">
        {item.fileMissing ? <div className="notice notice-warn"><AlertTriangle size={16} /> File not found at its saved location.</div>
          : item.kind === "image" ? <img src={fileUrl(item.filePath)} alt={item.title} />
          : item.kind === "video" ? <video src={fileUrl(item.filePath)} controls preload="metadata" poster={fileUrl(item.thumbnailPath)} />
          : <audio src={fileUrl(item.filePath)} controls preload="metadata" />}
      </div>
      <div className="pad form">
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() !== item.title && save({ title })} />
        </label>
        <label className="field">
          <span>Tags <em className="muted">(comma separated)</em></span>
          <input value={tags} placeholder="worship, sunrise, choir" onChange={(e) => setTags(e.target.value)} onBlur={() => tags !== item.tags && save({ tags })} />
        </label>
        <dl className="kv">
          <dt>Type</dt><dd>{item.kind}{item.hasAudio && item.kind === "video" ? " (with sound)" : ""}</dd>
          {item.width && <><dt>Size</dt><dd>{item.width}×{item.height}</dd></>}
          {item.durationMs != null && <><dt>Duration</dt><dd>{formatDuration(item.durationMs)}</dd></>}
          <dt>File</dt><dd>{formatBytes(item.fileSize)} · {item.originalName}</dd>
          <dt>Storage</dt><dd>{item.managed ? "Copied to library" : <><Link2 size={12} /> Linked in place</>}</dd>
          <dt>Used in</dt><dd>{item.usageCount} place{item.usageCount === 1 ? "" : "s"}</dd>
          <dt>Added</dt><dd>{formatWhen(item.createdAt)}</dd>
          <dt>Status</dt><dd>{item.probeStatus === "pending" ? "Waiting for FFmpeg processing" : item.probeStatus === "failed" ? "Could not read media details" : "Ready"}</dd>
        </dl>
        <div className="row gap wrap">
          <button className="btn btn-sm" disabled={item.fileMissing} onClick={() => api.openPath(item.filePath, true).catch(toast.error)}><FolderOpen size={14} /> Show in folder</button>
          <button className="btn btn-sm" onClick={reprocess} title="Read duration and make a new thumbnail"><RefreshCw size={14} /> Re-scan</button>
          <button className="btn btn-sm btn-ghost-danger" onClick={remove}><Trash2 size={14} /> Remove</button>
        </div>
      </div>
    </aside>
  );
}
