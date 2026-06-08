"use client";

import useSWR, { mutate } from "swr";
import { useState } from "react";
import { api, Settings } from "@/lib/api";

export default function SettingsPage() {
  const { data } = useSWR<Settings>("/api/settings", (u) => api.get(u));
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [saving, setSaving] = useState(false);

  if (!data) return <div className="text-ink-100/50">Loading…</div>;

  const merged: Settings = { ...data, ...draft };

  async function save() {
    setSaving(true);
    try {
      await api.patch("/api/settings", draft);
      setDraft({});
      await mutate("/api/settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold">Settings</h1>
      <div className="card space-y-4">
        <h3 className="font-semibold">Models</h3>
        <div>
          <label className="label">Ollama model</label>
          <input
            className="input"
            value={merged.ollama_model}
            onChange={(e) => setDraft({ ...draft, ollama_model: e.target.value })}
          />
          <p className="text-xs text-ink-100/40 mt-1">Pull with: <code>ollama pull {merged.ollama_model}</code></p>
        </div>
        <div>
          <label className="label">Image model</label>
          <input className="input" value={merged.image_model} readOnly />
        </div>
      </div>

      <div className="card grid grid-cols-2 md:grid-cols-3 gap-4">
        <h3 className="font-semibold col-span-full">Generation</h3>
        <div>
          <label className="label">Image width</label>
          <input
            type="number"
            className="input"
            value={merged.image_width}
            onChange={(e) => setDraft({ ...draft, image_width: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Image height</label>
          <input
            type="number"
            className="input"
            value={merged.image_height}
            onChange={(e) => setDraft({ ...draft, image_height: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Video fps</label>
          <input
            type="number"
            className="input"
            value={merged.video_fps}
            onChange={(e) => setDraft({ ...draft, video_fps: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="card text-sm text-ink-100/70 space-y-1">
        <div><span className="text-ink-100/40">Projects dir:</span> {data.projects_dir}</div>
        <div><span className="text-ink-100/40">Models dir:</span> {data.models_dir}</div>
        <div><span className="text-ink-100/40">Video resolution:</span> {data.video_width}×{data.video_height}</div>
      </div>

      <button className="btn-primary" onClick={save} disabled={saving || Object.keys(draft).length === 0}>
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
