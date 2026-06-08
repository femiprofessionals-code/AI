"use client";

import { useState } from "react";
import { Film } from "lucide-react";
import { api, Project, Scene, VideoExport } from "@/lib/api";
import { bytesToHuman, secondsToHMS } from "@/lib/utils";

export default function VideoPanel({
  project,
  scenes,
  videos,
  onJobStarted,
}: {
  project: Project;
  scenes: Scene[];
  videos: VideoExport[];
  onJobStarted: (jobId: number) => void;
}) {
  const [addSubs, setAddSubs] = useState(true);
  const [bgMusic, setBgMusic] = useState("");
  const [musicVol, setMusicVol] = useState(0.15);

  const ready = scenes.length > 0 && scenes.every((s) => s.image_path && s.audio_path);

  async function assemble() {
    const { job_id } = await api.post<{ job_id: number }>("/api/video/assemble", {
      project_id: project.id,
      add_subtitles: addSubs,
      background_music_path: bgMusic || null,
      music_volume: musicVol,
    });
    onJobStarted(job_id);
  }

  return (
    <div className="space-y-4">
      <div className="card grid md:grid-cols-4 gap-4 items-end">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={addSubs} onChange={(e) => setAddSubs(e.target.checked)} />
          Burn subtitles
        </label>
        <div>
          <label className="label">Background music path (optional)</label>
          <input className="input" placeholder="C:/path/to/music.mp3" value={bgMusic} onChange={(e) => setBgMusic(e.target.value)} />
        </div>
        <div>
          <label className="label">Music volume</label>
          <input type="range" min={0} max={1} step={0.05} value={musicVol} onChange={(e) => setMusicVol(Number(e.target.value))} className="w-full" />
          <div className="text-xs text-ink-100/40">{Math.round(musicVol * 100)}%</div>
        </div>
        <button className="btn-primary" onClick={assemble} disabled={!ready}>
          <Film className="w-4 h-4" /> Assemble video
        </button>
      </div>
      {!ready && (
        <div className="text-sm text-ink-100/50">
          Scenes need both images and audio before assembly.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {videos.map((v) => (
          <div key={v.id} className="card space-y-2">
            <div className="text-sm text-ink-100/40">Export #{v.id}</div>
            <video controls src={`/files/projects/${project.id}/exports/${v.path.split("/").pop()}`} className="w-full rounded-xl" />
            <div className="text-sm text-ink-100/70 flex flex-wrap gap-3">
              <span>{v.width}×{v.height}</span>
              <span>{v.fps}fps</span>
              <span>{secondsToHMS(v.duration_sec)}</span>
              <span>{bytesToHuman(v.size_bytes)}</span>
            </div>
            <a className="btn-secondary text-sm" href={`/api/video/${v.id}/download`}>Download MP4</a>
          </div>
        ))}
        {videos.length === 0 && <div className="text-ink-100/50 text-sm">No exports yet.</div>}
      </div>
    </div>
  );
}
