"use client";

import { useState } from "react";
import { Mic } from "lucide-react";
import { api, Project, Scene } from "@/lib/api";

export default function VoicePanel({
  project,
  scenes,
  onJobStarted,
}: {
  project: Project;
  scenes: Scene[];
  onJobStarted: (jobId: number) => void;
}) {
  const [voice, setVoice] = useState<"male" | "female">(project.voice as "male" | "female");
  const [transcribing, setTranscribing] = useState(false);
  const [srtPath, setSrtPath] = useState<string | null>(null);

  async function genAll() {
    const { job_id } = await api.post<{ job_id: number }>("/api/voice/generate", {
      project_id: project.id,
      voice,
    });
    onJobStarted(job_id);
  }
  async function genOne(scene_id: number) {
    const { job_id } = await api.post<{ job_id: number }>("/api/voice/generate", {
      project_id: project.id,
      scene_id,
      voice,
    });
    onJobStarted(job_id);
  }
  async function transcribe() {
    setTranscribing(true);
    try {
      const r = await api.post<{ srt_path: string }>("/api/voice/transcribe", { project_id: project.id });
      setSrtPath(r.srt_path);
    } finally {
      setTranscribing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">Voice</label>
          <select
            className="input"
            value={voice}
            onChange={(e) => setVoice(e.target.value as "male" | "female")}
          >
            <option value="female">female</option>
            <option value="male">male</option>
          </select>
        </div>
        <button className="btn-primary" onClick={genAll} disabled={!scenes.length}>
          <Mic className="w-4 h-4" /> Generate all
        </button>
        <button className="btn-secondary" onClick={transcribe} disabled={transcribing}>
          {transcribing ? "Transcribing…" : "Generate subtitles"}
        </button>
        {srtPath && (
          <a className="text-accent text-sm" href={srtPath} target="_blank" rel="noreferrer">
            Download SRT
          </a>
        )}
      </div>

      <div className="space-y-3">
        {scenes.map((sc) => (
          <div key={sc.id} className="card">
            <div className="text-xs uppercase text-ink-100/40 mb-2">Scene {sc.idx + 1}</div>
            <div className="text-sm text-ink-100/80 mb-3">{sc.narration}</div>
            {sc.audio_path ? (
              <audio controls src={sc.audio_path} className="w-full" />
            ) : (
              <div className="text-ink-100/40 text-sm">no audio yet</div>
            )}
            <button className="btn-secondary text-sm mt-3" onClick={() => genOne(sc.id)}>Regenerate</button>
          </div>
        ))}
      </div>
    </div>
  );
}
