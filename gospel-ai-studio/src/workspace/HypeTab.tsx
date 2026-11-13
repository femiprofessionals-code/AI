import { useEffect, useState } from "react";
import { Music, Gauge, Target, X, AudioWaveform } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../hooks/useLoad";
import { useToast } from "../components/Toasts";
import { useConfirm } from "../components/Confirm";
import { MediaPicker } from "../components/MediaPicker";
import { fileUrl, formatDuration } from "../lib/format";
import type { Project } from "../lib/types";

export function HypeTab({ project, onUpdate, onChanged }: {
  project: Project;
  onUpdate: (patch: Parameters<typeof api.projectUpdate>[1]) => Promise<void>;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [bpm, setBpm] = useState(String(project.bpm ?? 120));
  const [target, setTarget] = useState(String(project.targetSeconds ?? 30));
  const [volume, setVolume] = useState(Math.round(project.musicVolume * 100));
  const [picking, setPicking] = useState(false);
  useEffect(() => { setBpm(String(project.bpm ?? 120)); setTarget(String(project.targetSeconds ?? 30)); setVolume(Math.round(project.musicVolume * 100)); }, [project]);

  const music = useLoad(async () => (project.musicMediaId ? (await api.mediaList({ kind: "audio" })).find((m) => m.id === project.musicMediaId) ?? null : null), [project.musicMediaId]);

  const bpmNum = Number(bpm);
  const beat = bpmNum > 0 ? 60 / bpmNum : 0;
  const bar = beat * 4;
  const targetMs = (project.targetSeconds ?? 0) * 1000;
  const diff = project.totalDurationMs - targetMs;

  const commitNumber = (raw: string, current: number | null, key: "bpm" | "targetSeconds", min: number, max: number) => {
    const n = Math.round(Number(raw));
    if (!isFinite(n) || n < min || n > max) {
      toast.error(`Enter a number between ${min} and ${max}.`);
      return false;
    }
    if (n !== current) void onUpdate({ [key]: n });
    return true;
  };

  const snapToBars = async () => {
    if (!bar) return;
    const r = await confirm({
      title: "Snap scene durations to the beat?",
      message: <>Each scene's duration is rounded to the nearest whole bar ({bar.toFixed(2)}s at {bpmNum} BPM, 4 beats per bar), minimum one bar.</>,
      confirmLabel: "Snap durations",
    });
    if (!r.ok) return;
    try {
      const scenes = await api.scenesList(project.id);
      let changed = 0;
      for (const s of scenes) {
        const bars = Math.max(1, Math.round(s.durationMs / 1000 / bar));
        const ms = Math.min(600000, Math.round(bars * bar * 1000));
        if (ms !== s.durationMs) {
          await api.sceneUpdate(s.id, { durationMs: ms });
          changed++;
        }
      }
      onChanged();
      toast.success(changed ? `Updated ${changed} scene${changed === 1 ? "" : "s"}` : "All scenes already fit the beat");
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="hype-grid">
      <section className="panel">
        <div className="panel-head"><h2><Gauge size={16} /> Tempo</h2></div>
        <div className="pad form">
          <label className="field">
            <span>Beats per minute</span>
            <input type="number" className="num" min={40} max={220} value={bpm} onChange={(e) => setBpm(e.target.value)}
              onBlur={() => commitNumber(bpm, project.bpm, "bpm", 40, 220) || setBpm(String(project.bpm ?? 120))} />
          </label>
          <dl className="kv">
            <dt>One beat</dt><dd>{beat ? `${beat.toFixed(3)}s` : "–"}</dd>
            <dt>One bar (4 beats)</dt><dd>{bar ? `${bar.toFixed(2)}s` : "–"}</dd>
          </dl>
          <button className="btn" onClick={snapToBars} disabled={!bar || project.sceneCount === 0}>Snap scene durations to bars</button>
          <p className="muted small">Match BPM to your music track so cuts land on the beat.</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2><Target size={16} /> Target length</h2></div>
        <div className="pad form">
          <label className="field">
            <span>Target (seconds)</span>
            <input type="number" className="num" min={1} max={3600} value={target} onChange={(e) => setTarget(e.target.value)}
              onBlur={() => commitNumber(target, project.targetSeconds, "targetSeconds", 1, 3600) || setTarget(String(project.targetSeconds ?? 30))} />
          </label>
          <div className="presets">
            {[15, 30, 60, 90].map((s) => <button key={s} className="chip" onClick={() => { setTarget(String(s)); void onUpdate({ targetSeconds: s }); }}>{s}s</button>)}
          </div>
          <dl className="kv">
            <dt>Scenes total</dt><dd>{formatDuration(project.totalDurationMs)}</dd>
            <dt>Difference</dt>
            <dd className={Math.abs(diff) <= 1000 ? "ok" : "warn"}>
              {targetMs === 0 ? "–" : Math.abs(diff) <= 1000 ? "On target" : `${diff > 0 ? "+" : "−"}${formatDuration(Math.abs(diff))} ${diff > 0 ? "over" : "under"}`}
            </dd>
          </dl>
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-head"><h2><Music size={16} /> Music bed</h2></div>
        <div className="pad form">
          {project.musicMediaId && music.data ? (
            <div className="music-row">
              <AudioWaveform size={20} />
              <div className="grow">
                <strong>{music.data.title}</strong>
                <div className="muted small">{formatDuration(music.data.durationMs)} · loops if shorter than the video</div>
              </div>
              <audio src={fileUrl(music.data.filePath)} controls preload="none" />
              <button className="btn btn-sm" onClick={() => setPicking(true)}>Change</button>
              <button className="icon-btn" title="Remove music" onClick={() => onUpdate({ musicMediaId: "" })}><X size={16} /></button>
            </div>
          ) : (
            <button className="slot-empty" onClick={() => setPicking(true)}>Choose a music track from your library…</button>
          )}
          <label className="field">
            <span>Music volume under voices: {volume}%</span>
            <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))}
              onPointerUp={() => onUpdate({ musicVolume: volume / 100 })} onKeyUp={() => onUpdate({ musicVolume: volume / 100 })} />
          </label>
          <p className="muted small">Use music you own or have a licence for. The draft render mixes it under each scene's audio.</p>
        </div>
      </section>

      {picking && (
        <MediaPicker kinds={["audio"]} title="Choose a music track" current={project.musicMediaId}
          onClose={() => setPicking(false)}
          onPick={(id) => { setPicking(false); void onUpdate({ musicMediaId: id ?? "" }); }} />
      )}
    </div>
  );
}
