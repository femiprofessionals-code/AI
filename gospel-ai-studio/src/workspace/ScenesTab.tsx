import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Copy, Trash2, ChevronUp, ChevronDown, GripVertical, Film, ImagePlus, Mic, Timer, X } from "lucide-react";
import { api, EVENTS } from "../lib/api";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { useApp } from "../lib/appContext";
import { useLoad } from "../hooks/useLoad";
import { useAutosave } from "../hooks/useAutosave";
import { useToast } from "../components/Toasts";
import { useConfirm } from "../components/Confirm";
import { EmptyState, ErrorBox, SaveIndicator, Spinner } from "../components/Common";
import { MediaPicker, MediaThumb } from "../components/MediaPicker";
import { fileUrl, formatDuration, formatSeconds } from "../lib/format";
import { countWords } from "../lib/scriptStats";
import type { MediaItem, Project, Scene, SceneInput, Speaker } from "../lib/types";

export function ScenesTab({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: scenes, setData: setScenes, error, reload } = useLoad(() => api.scenesList(project.id), [project.id]);
  const speakers = useLoad<Speaker[]>(
    () => (project.kind === "conversation" ? api.speakersList(project.id) : Promise.resolve([])),
    [project.id],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    if (scenes && (!selectedId || !scenes.some((s) => s.id === selectedId))) setSelectedId(scenes[0]?.id ?? null);
  }, [scenes, selectedId]);

  // Thumbnails and durations are produced in the background after import.
  useTauriEvent<MediaItem>(EVENTS.media, (m) =>
    setScenes((list) => list?.map((s) =>
      s.visualMediaId === m.id ? { ...s, visualThumbnail: m.thumbnailPath, visualTitle: m.title }
      : s.audioMediaId === m.id ? { ...s, audioDurationMs: m.durationMs, audioTitle: m.title }
      : s)),
  );

  const selected = scenes?.find((s) => s.id === selectedId) ?? null;
  const total = useMemo(() => (scenes ?? []).reduce((a, s) => a + s.durationMs, 0), [scenes]);

  const replaceScene = (s: Scene) => setScenes((list) => list?.map((x) => (x.id === s.id ? s : x)));

  const add = async () => {
    try {
      const s = await api.sceneCreate(project.id, { title: `Scene ${(scenes?.length ?? 0) + 1}` }, selected?.position);
      setScenes(await api.scenesList(project.id));
      setSelectedId(s.id);
      onChanged();
    } catch (e) {
      toast.error(e);
    }
  };
  const duplicate = async (s: Scene) => {
    try {
      const d = await api.sceneDuplicate(s.id);
      setScenes(await api.scenesList(project.id));
      setSelectedId(d.id);
      onChanged();
    } catch (e) {
      toast.error(e);
    }
  };
  const remove = async (s: Scene) => {
    const r = await confirm({ title: "Delete scene?", message: <>Delete “{s.title || "Untitled scene"}”? Media files stay in your library.</>, confirmLabel: "Delete", danger: true });
    if (!r.ok) return;
    try {
      await api.sceneDelete(s.id);
      setScenes(await api.scenesList(project.id));
      onChanged();
    } catch (e) {
      toast.error(e);
    }
  };
  const reorder = async (ids: string[]) => {
    if (!scenes) return;
    const byId = new Map(scenes.map((s) => [s.id, s]));
    setScenes(ids.map((id, i) => ({ ...byId.get(id)!, position: i })));
    try {
      setScenes(await api.scenesReorder(project.id, ids));
    } catch (e) {
      toast.error(e);
      void reload();
    }
  };
  const move = (s: Scene, delta: number) => {
    if (!scenes) return;
    const ids = scenes.map((x) => x.id);
    const i = ids.indexOf(s.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void reorder(ids);
  };
  const drop = (targetId: string) => {
    if (!scenes || !dragId || dragId === targetId) return;
    const ids = scenes.map((x) => x.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId) + (scenes.findIndex((s) => s.id === dragId) < scenes.findIndex((s) => s.id === targetId) ? 1 : 0), 0, dragId);
    void reorder(ids);
  };

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!scenes) return <Spinner />;

  if (scenes.length === 0) {
    return (
      <EmptyState icon={<Film size={30} />} title="No scenes yet"
        action={<div className="row gap"><Link className="btn btn-primary" to={`/projects/${project.id}/script`}>Create from script</Link><button className="btn" onClick={add}><Plus size={16} /> Add a blank scene</button></div>}>
        Scenes are the building blocks of your video. Each has text, an optional image or clip, optional voice audio and a duration.
      </EmptyState>
    );
  }

  return (
    <div className="scenes-layout">
      <div className="scene-list-col">
        <div className="scene-list-head">
          <span><strong>{scenes.length}</strong> scenes · {formatDuration(total)}</span>
          <button className="btn btn-sm btn-primary" onClick={add} title="Add a scene after the selected one"><Plus size={15} /> Add</button>
        </div>
        <ol className="scene-list">
          {scenes.map((s, i) => (
            <li
              key={s.id}
              className={`scene-item ${s.id === selectedId ? "selected" : ""} ${overId === s.id && dragId !== s.id ? "drop-target" : ""}`}
              draggable
              onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDragOver={(e) => { e.preventDefault(); setOverId(s.id); }}
              onDrop={(e) => { e.preventDefault(); drop(s.id); setDragId(null); setOverId(null); }}
              onClick={() => setSelectedId(s.id)}
            >
              <GripVertical size={14} className="grip" />
              <span className="scene-num">{i + 1}</span>
              {s.visualMediaId ? (
                <MediaThumb item={{ kind: s.visualKind ?? "image", thumbnailPath: s.visualThumbnail, title: s.visualTitle ?? "" }} size="sm" />
              ) : (
                <div className="thumb thumb-sm thumb-card" title="Text card"><span>Aa</span></div>
              )}
              <div className="scene-item-text">
                <div className="scene-item-title">{s.title || "Untitled scene"}</div>
                <div className="muted small scene-item-meta">
                  {s.speakerName && <span className="speaker-tag" style={{ color: s.speakerColor ?? undefined }}>{s.speakerName}</span>}
                  {s.audioMediaId && <Mic size={11} />}
                  <span>{formatSeconds(s.durationMs)}</span>
                </div>
              </div>
              <div className="scene-item-actions">
                <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(s, -1); }}><ChevronUp size={14} /></button>
                <button className="icon-btn" aria-label="Move down" disabled={i === scenes.length - 1} onClick={(e) => { e.stopPropagation(); move(s, 1); }}><ChevronDown size={14} /></button>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="scene-editor-col">
        {selected && (
          <SceneEditor
            key={selected.id}
            scene={selected}
            index={scenes.indexOf(selected)}
            project={project}
            speakers={speakers.data ?? []}
            onSaved={(s) => { replaceScene(s); onChanged(); }}
            onDuplicate={() => duplicate(selected)}
            onDelete={() => remove(selected)}
          />
        )}
      </div>
    </div>
  );
}

interface Draft { title: string; scriptText: string; notes: string; durationSec: string }

function SceneEditor({ scene, index, project, speakers, onSaved, onDuplicate, onDelete }: {
  scene: Scene; index: number; project: Project; speakers: Speaker[];
  onSaved: (s: Scene) => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const { settings } = useApp();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>({
    title: scene.title, scriptText: scene.scriptText, notes: scene.notes, durationSec: String(scene.durationMs / 1000),
  });
  const [picker, setPicker] = useState<"visual" | "audio" | null>(null);
  const durationError = useRef<string | null>(null);

  const autosave = useAutosave<Draft>(async (d) => {
    const secs = Number(d.durationSec);
    const input: SceneInput = { title: d.title, scriptText: d.scriptText, notes: d.notes };
    if (isFinite(secs) && secs >= 0.5 && secs <= 600) input.durationMs = Math.round(secs * 1000);
    onSaved(await api.sceneUpdate(scene.id, input));
  }, settings?.autosaveDelayMs ?? 800);

  const change = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    autosave.update(next);
  };

  const setRef = async (input: SceneInput) => {
    try {
      await autosave.flush();
      const s = await api.sceneUpdate(scene.id, input);
      onSaved(s);
      setDraft((d) => ({ ...d, durationSec: String(s.durationMs / 1000) }));
    } catch (e) {
      toast.error(e);
    }
  };

  const wpm = project.kind === "hypeman" ? settings?.wordsPerMinuteHypeman ?? 170 : settings?.wordsPerMinuteConversation ?? 150;
  const words = countWords(draft.scriptText);
  const spokenSec = Math.max(1.5, Math.round((words / wpm) * 600) / 10);
  const secs = Number(draft.durationSec);
  durationError.current = !isFinite(secs) || secs < 0.5 || secs > 600 ? "Use 0.5 – 600 seconds" : null;

  return (
    <div className="scene-editor panel">
      <div className="panel-head">
        <h2>Scene {index + 1}</h2>
        <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} error={autosave.error} />
        <div className="spacer" />
        <button className="btn btn-sm" onClick={onDuplicate}><Copy size={14} /> Duplicate</button>
        <button className="btn btn-sm btn-ghost-danger" onClick={onDelete}><Trash2 size={14} /> Delete</button>
      </div>

      <div className="scene-form">
        <label className="field">
          <span>Title</span>
          <input value={draft.title} maxLength={120} onChange={(e) => change({ title: e.target.value })} onBlur={() => void autosave.flush()} />
        </label>

        {project.kind === "conversation" && (
          <label className="field">
            <span>Speaker</span>
            <select value={scene.speakerId ?? ""} onChange={(e) => setRef({ speakerId: e.target.value })}>
              <option value="">No speaker (narration / B-roll)</option>
              {speakers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.role ? ` — ${s.role}` : ""}</option>)}
            </select>
            {speakers.length === 0 && <span className="muted small">Add people on the <Link to={`/projects/${project.id}/cast`}>Cast</Link> tab.</span>}
          </label>
        )}

        <label className="field">
          <span>{project.kind === "hypeman" ? "Hype line" : "Line / narration"}</span>
          <textarea rows={4} value={draft.scriptText} onChange={(e) => change({ scriptText: e.target.value })} onBlur={() => void autosave.flush()} />
          <span className="muted small">{words} words · ≈ {spokenSec}s spoken. Scenes without a visual render as a text card showing this line.</span>
        </label>

        <div className="media-slots">
          <div className="media-slot">
            <div className="slot-label"><ImagePlus size={14} /> Visual</div>
            {scene.visualMediaId ? (
              <div className="slot-filled">
                {scene.visualKind === "video" && scene.visualPath ? (
                  <video className="slot-preview" src={fileUrl(scene.visualPath)} controls preload="metadata" />
                ) : scene.visualPath ? (
                  <img className="slot-preview" src={fileUrl(scene.visualThumbnail ?? scene.visualPath)} alt="" />
                ) : null}
                <div className="slot-row">
                  <span className="ellipsis">{scene.visualTitle}</span>
                  <button className="btn btn-sm" onClick={() => setPicker("visual")}>Change</button>
                  <button className="icon-btn" title="Remove visual" onClick={() => setRef({ visualMediaId: "" })}><X size={14} /></button>
                </div>
              </div>
            ) : (
              <button className="slot-empty" onClick={() => setPicker("visual")}>Choose image or video…</button>
            )}
          </div>
          <div className="media-slot">
            <div className="slot-label"><Mic size={14} /> Voice / audio</div>
            {scene.audioMediaId ? (
              <div className="slot-filled">
                {scene.audioPath && <audio className="slot-audio" src={fileUrl(scene.audioPath)} controls preload="metadata" />}
                <div className="slot-row">
                  <span className="ellipsis">{scene.audioTitle} {scene.audioDurationMs ? `· ${formatDuration(scene.audioDurationMs)}` : ""}</span>
                  <button className="btn btn-sm" onClick={() => setPicker("audio")}>Change</button>
                  <button className="icon-btn" title="Remove audio" onClick={() => setRef({ audioMediaId: "" })}><X size={14} /></button>
                </div>
              </div>
            ) : (
              <button className="slot-empty" onClick={() => setPicker("audio")}>Choose a recording…</button>
            )}
          </div>
        </div>

        <div className="field">
          <span><Timer size={14} /> Duration (seconds)</span>
          <div className="row gap">
            <input type="number" min={0.5} max={600} step={0.1} className="num" value={draft.durationSec}
              onChange={(e) => change({ durationSec: e.target.value })} onBlur={() => void autosave.flush()} aria-invalid={!!durationError.current} />
            {scene.audioDurationMs != null && (
              <button className="btn btn-sm" onClick={() => change({ durationSec: String(Math.min(600, Math.max(0.5, Math.ceil(scene.audioDurationMs! / 100) / 10))) })}>
                Match audio ({formatSeconds(scene.audioDurationMs)})
              </button>
            )}
            <button className="btn btn-sm" onClick={() => change({ durationSec: String(spokenSec) })}>Use spoken estimate ({spokenSec}s)</button>
          </div>
          {durationError.current && <span className="error-text small">{durationError.current}</span>}
        </div>

        <label className="field">
          <span>Production notes</span>
          <textarea rows={3} value={draft.notes} placeholder="Camera, lighting, B-roll ideas…" onChange={(e) => change({ notes: e.target.value })} onBlur={() => void autosave.flush()} />
        </label>
      </div>

      {picker && (
        <MediaPicker
          kinds={picker === "visual" ? ["image", "video"] : ["audio"]}
          title={picker === "visual" ? "Choose a visual" : "Choose voice or audio"}
          current={picker === "visual" ? scene.visualMediaId : scene.audioMediaId}
          onClose={() => setPicker(null)}
          onPick={(id) => {
            setPicker(null);
            void setRef(picker === "visual" ? { visualMediaId: id ?? "" } : { audioMediaId: id ?? "" });
          }}
        />
      )}
    </div>
  );
}
