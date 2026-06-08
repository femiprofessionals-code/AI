"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { Plus, Trash2 } from "lucide-react";
import { api, Project } from "@/lib/api";

const STYLES = ["realistic", "documentary", "cinematic", "photorealistic", "historical", "motivational"];
const VOICES = ["female", "male"];

export default function ProjectsPage() {
  const { data, isLoading } = useSWR("/api/projects", (u) => api.get<Project[]>(u));
  const [form, setForm] = useState({ name: "", topic: "", style: "cinematic", voice: "female" });
  const [creating, setCreating] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.topic) return;
    setCreating(true);
    try {
      await api.post<Project>("/api/projects", form);
      setForm({ name: "", topic: "", style: "cinematic", voice: "female" });
      await mutate("/api/projects");
    } finally {
      setCreating(false);
    }
  }

  async function del(id: number) {
    if (!confirm("Delete this project? Files on disk are kept.")) return;
    await api.delete(`/api/projects/${id}`);
    await mutate("/api/projects");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Projects</h1>
        <p className="text-ink-100/60 mt-1">One project per video idea.</p>
      </header>

      <form onSubmit={create} className="card grid md:grid-cols-5 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="label">Name</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="How honey is made"
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Topic</label>
          <input
            className="input"
            value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
            placeholder="A 60-second explainer on how bees produce honey"
          />
        </div>
        <div>
          <label className="label">Style</label>
          <select className="input" value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })}>
            {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Voice</label>
          <select className="input" value={form.voice} onChange={(e) => setForm({ ...form, voice: e.target.value })}>
            {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <button className="btn-primary md:col-span-1" disabled={creating}>
          <Plus className="w-4 h-4" /> Create
        </button>
      </form>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && <div className="text-ink-100/50">Loading…</div>}
        {data?.map((p) => (
          <div key={p.id} className="card flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/studio/${p.id}`} className="text-lg font-semibold hover:text-accent">
                  {p.name}
                </Link>
                <p className="text-sm text-ink-100/60 line-clamp-2 mt-1">{p.topic}</p>
              </div>
              <button
                onClick={() => del(p.id)}
                className="text-ink-100/40 hover:text-red-400 p-1"
                aria-label="Delete project"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <span className="badge">{p.style}</span>
              <span className="badge">{p.voice}</span>
            </div>
            <Link className="btn-secondary self-start" href={`/studio/${p.id}`}>Open studio</Link>
          </div>
        ))}
        {data && data.length === 0 && (
          <div className="text-ink-100/50 col-span-full">No projects yet. Create one above.</div>
        )}
      </div>
    </div>
  );
}
