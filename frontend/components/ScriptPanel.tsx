"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { api, Project, Script } from "@/lib/api";

export default function ScriptPanel({
  project,
  script,
  onGenerated,
}: {
  project: Project;
  script: Script | undefined;
  onGenerated: () => void;
}) {
  const [seconds, setSeconds] = useState(60);
  const [tone, setTone] = useState("engaging");
  const [topic, setTopic] = useState(project.topic);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      await api.post<Script>("/api/scripts/generate", {
        project_id: project.id,
        topic,
        target_seconds: seconds,
        tone,
      });
      onGenerated();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="card lg:col-span-1 space-y-3">
        <h3 className="font-semibold">Script settings</h3>
        <div>
          <label className="label">Topic</label>
          <textarea className="input min-h-[80px]" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="label">Length (s)</label>
            <input
              type="number"
              className="input"
              min={15}
              max={600}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
            />
          </div>
          <div className="flex-1">
            <label className="label">Tone</label>
            <select className="input" value={tone} onChange={(e) => setTone(e.target.value)}>
              <option>engaging</option>
              <option>dramatic</option>
              <option>calm</option>
              <option>educational</option>
              <option>motivational</option>
            </select>
          </div>
        </div>
        <button className="btn-primary w-full" onClick={generate} disabled={loading}>
          <Wand2 className="w-4 h-4" /> {loading ? "Generating…" : "Generate script"}
        </button>
      </div>

      <div className="card lg:col-span-2 space-y-4">
        <h3 className="font-semibold">Result</h3>
        {!script && <p className="text-ink-100/50 text-sm">Generate to see hook, body, and CTA.</p>}
        {script && (
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase text-ink-100/40 mb-1">Hook</div>
              <div className="bg-ink-950 rounded-xl border border-white/5 p-3 whitespace-pre-wrap">{script.hook}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-ink-100/40 mb-1">Body</div>
              <div className="bg-ink-950 rounded-xl border border-white/5 p-3 whitespace-pre-wrap">{script.body}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-ink-100/40 mb-1">CTA</div>
              <div className="bg-ink-950 rounded-xl border border-white/5 p-3 whitespace-pre-wrap">{script.cta}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
