"use client";

import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { api, Project, Scene } from "@/lib/api";

export default function ImagesPanel({
  project,
  scenes,
  onJobStarted,
}: {
  project: Project;
  scenes: Scene[];
  onJobStarted: (jobId: number) => void;
}) {
  const [style, setStyle] = useState(project.style);
  const [seed, setSeed] = useState<string>("");

  async function genAll() {
    const { job_id } = await api.post<{ job_id: number }>("/api/images/generate", {
      project_id: project.id,
      style,
      seed: seed ? Number(seed) : null,
    });
    onJobStarted(job_id);
  }
  async function genOne(scene_id: number) {
    const { job_id } = await api.post<{ job_id: number }>("/api/images/generate", {
      project_id: project.id,
      scene_id,
      style,
      seed: seed ? Number(seed) : null,
    });
    onJobStarted(job_id);
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">Style</label>
          <select className="input" value={style} onChange={(e) => setStyle(e.target.value)}>
            {["realistic", "documentary", "cinematic", "photorealistic", "historical", "motivational"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Seed (optional)</label>
          <input className="input w-32" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="random" />
        </div>
        <button className="btn-primary" onClick={genAll} disabled={!scenes.length}>
          <ImageIcon className="w-4 h-4" /> Generate all
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenes.map((sc) => (
          <div key={sc.id} className="card space-y-2">
            <div className="text-xs uppercase text-ink-100/40">Scene {sc.idx + 1}</div>
            {sc.image_path ? (
              <img src={sc.image_path} alt="" className="rounded-xl aspect-video object-cover w-full bg-ink-950" />
            ) : (
              <div className="rounded-xl aspect-video bg-ink-950 border border-dashed border-white/10 grid place-items-center text-ink-100/40 text-sm">
                no image yet
              </div>
            )}
            <div className="text-sm text-ink-100/70 line-clamp-3">{sc.image_prompt}</div>
            <button className="btn-secondary text-sm" onClick={() => genOne(sc.id)}>Regenerate</button>
          </div>
        ))}
      </div>
    </div>
  );
}
