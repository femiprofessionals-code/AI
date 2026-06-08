"use client";

import { useState } from "react";
import { Layers, Pencil } from "lucide-react";
import { api, Project, Scene, Script } from "@/lib/api";

export default function ScenesPanel({
  project,
  script,
  scenes,
  onGenerated,
}: {
  project: Project;
  script: Script | undefined;
  scenes: Scene[];
  onGenerated: () => void;
}) {
  const [avg, setAvg] = useState(5);
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!script) return;
    setLoading(true);
    try {
      await api.post("/api/scenes/generate", {
        project_id: project.id,
        script_id: script.id,
        avg_scene_seconds: avg,
      });
      onGenerated();
    } finally {
      setLoading(false);
    }
  }

  async function patch(id: number, patchObj: Partial<Scene>) {
    await api.patch(`/api/scenes/${id}`, patchObj);
    onGenerated();
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-4">
        <div>
          <div className="label">Avg scene length (s)</div>
          <input
            type="number"
            className="input w-32"
            min={2}
            max={15}
            value={avg}
            onChange={(e) => setAvg(Number(e.target.value))}
          />
        </div>
        <button className="btn-primary" onClick={generate} disabled={loading || !script}>
          <Layers className="w-4 h-4" /> {loading ? "Splitting…" : "Generate scenes"}
        </button>
        {!script && <span className="text-ink-100/50 text-sm">Generate a script first.</span>}
      </div>

      <div className="space-y-3">
        {scenes.length === 0 && <div className="text-ink-100/50 text-sm">No scenes yet.</div>}
        {scenes.map((sc) => (
          <SceneRow key={sc.id} scene={sc} onPatch={patch} />
        ))}
      </div>
    </div>
  );
}

function SceneRow({ scene, onPatch }: { scene: Scene; onPatch: (id: number, p: Partial<Scene>) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    narration: scene.narration,
    image_prompt: scene.image_prompt,
    duration_sec: scene.duration_sec,
  });
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-ink-100/40">Scene {scene.idx + 1} · {scene.duration_sec.toFixed(1)}s</div>
        <button className="text-ink-100/40 hover:text-accent" onClick={() => setEditing((v) => !v)}>
          <Pencil className="w-4 h-4" />
        </button>
      </div>
      {editing ? (
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="label">Narration</label>
            <textarea className="input min-h-[70px]" value={draft.narration}
              onChange={(e) => setDraft({ ...draft, narration: e.target.value })} />
          </div>
          <div>
            <label className="label">Image prompt</label>
            <textarea className="input min-h-[70px]" value={draft.image_prompt}
              onChange={(e) => setDraft({ ...draft, image_prompt: e.target.value })} />
          </div>
          <div>
            <label className="label">Duration (s)</label>
            <input type="number" step="0.1" className="input w-32" value={draft.duration_sec}
              onChange={(e) => setDraft({ ...draft, duration_sec: Number(e.target.value) })} />
          </div>
          <div className="flex items-end gap-2">
            <button className="btn-primary" onClick={() => { onPatch(scene.id, draft); setEditing(false); }}>Save</button>
            <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3 mt-2">
          <div><div className="text-xs uppercase text-ink-100/40 mb-1">Narration</div><div>{scene.narration}</div></div>
          <div><div className="text-xs uppercase text-ink-100/40 mb-1">Image prompt</div><div className="text-ink-100/80">{scene.image_prompt}</div></div>
        </div>
      )}
    </div>
  );
}
