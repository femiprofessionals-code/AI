"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, Project, Scene } from "@/lib/api";

export default function ThumbnailsPage() {
  const { data: projects } = useSWR<Project[]>("/api/projects", (u) => api.get(u));
  const [projectId, setProjectId] = useState<number | null>(null);
  const { data: scenes } = useSWR<Scene[]>(
    projectId ? `/api/scenes/by-project/${projectId}` : null,
    (u) => api.get(u),
  );
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<"youtube" | "facebook">("youtube");
  const [bgSceneId, setBgSceneId] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (!projectId || !title) return;
    setLoading(true);
    try {
      const r = await api.post<{ path: string }>("/api/thumbnails/generate", {
        project_id: projectId,
        title,
        platform,
        background_scene_id: bgSceneId,
      });
      setResult(`${r.path}?t=${Date.now()}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Thumbnail maker</h1>
      <div className="card grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Project</label>
          <select
            className="input"
            value={projectId ?? ""}
            onChange={(e) => setProjectId(Number(e.target.value) || null)}
          >
            <option value="">— pick —</option>
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Platform</label>
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value as any)}>
            <option value="youtube">YouTube (1280×720)</option>
            <option value="facebook">Facebook (1200×630)</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label">Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Top 10 facts about ..." />
        </div>
        <div className="md:col-span-2">
          <label className="label">Background scene (optional)</label>
          <select
            className="input"
            value={bgSceneId ?? ""}
            onChange={(e) => setBgSceneId(Number(e.target.value) || null)}
            disabled={!scenes?.length}
          >
            <option value="">— solid color —</option>
            {scenes?.filter((s) => s.image_path).map((s) => (
              <option key={s.id} value={s.id}>Scene {s.idx + 1}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <button className="btn-primary" onClick={generate} disabled={loading || !projectId || !title}>
            {loading ? "Rendering…" : "Generate thumbnail"}
          </button>
        </div>
      </div>

      {result && (
        <div className="card">
          <img src={result} alt="thumbnail" className="rounded-xl max-w-full" />
          <a className="text-accent text-sm mt-3 inline-block" href={result} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
        </div>
      )}
    </div>
  );
}
