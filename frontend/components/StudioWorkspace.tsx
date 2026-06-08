"use client";

import useSWR, { mutate } from "swr";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api, Project, Script, Scene, VideoExport, streamJob } from "@/lib/api";
import ScriptPanel from "./ScriptPanel";
import ScenesPanel from "./ScenesPanel";
import ImagesPanel from "./ImagesPanel";
import VoicePanel from "./VoicePanel";
import VideoPanel from "./VideoPanel";

const STEPS = ["Script", "Scenes", "Images", "Voice", "Video"] as const;

export default function StudioWorkspace({ projectId }: { projectId: number }) {
  const { data: project } = useSWR<Project>(`/api/projects/${projectId}`, (u) => api.get<Project>(u));
  const { data: scripts } = useSWR<Script[]>(`/api/scripts/by-project/${projectId}`, (u) => api.get(u));
  const { data: scenes } = useSWR<Scene[]>(`/api/scenes/by-project/${projectId}`, (u) => api.get(u));
  const { data: videos } = useSWR<VideoExport[]>(`/api/video/by-project/${projectId}`, (u) => api.get(u));

  const [step, setStep] = useState<(typeof STEPS)[number]>("Script");
  const [activeJob, setActiveJob] = useState<{ kind: string; progress: number; message: string } | null>(null);

  const script = scripts?.[0];

  async function runJob(kind: string, jobId: number, onDone?: () => void | Promise<void>) {
    setActiveJob({ kind, progress: 0, message: "queued" });
    try {
      await streamJob(jobId, (u) => setActiveJob({ kind, progress: u.progress, message: u.message }));
      await onDone?.();
    } finally {
      setActiveJob(null);
    }
  }

  if (!project) return <div className="text-ink-100/50">Loading project…</div>;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-ink-100/60 mt-1 max-w-2xl">{project.topic}</p>
          <div className="flex gap-2 mt-3">
            <span className="badge">{project.style}</span>
            <span className="badge">{project.voice}</span>
          </div>
        </div>
        {activeJob && (
          <div className="card flex items-center gap-3 min-w-[280px]">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            <div className="flex-1">
              <div className="text-sm">{activeJob.kind}: {activeJob.message}</div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(activeJob.progress * 100)}%` }} />
              </div>
            </div>
          </div>
        )}
      </header>

      <nav className="flex gap-2 flex-wrap">
        {STEPS.map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={
              "px-4 py-2 rounded-xl text-sm border transition " +
              (step === s ? "bg-accent text-white border-accent" : "bg-ink-900 border-white/5 hover:border-white/20")
            }
          >
            {s}
          </button>
        ))}
      </nav>

      {step === "Script" && (
        <ScriptPanel
          project={project}
          script={script}
          onGenerated={() => mutate(`/api/scripts/by-project/${projectId}`)}
        />
      )}
      {step === "Scenes" && (
        <ScenesPanel
          project={project}
          script={script}
          scenes={scenes ?? []}
          onGenerated={() => mutate(`/api/scenes/by-project/${projectId}`)}
        />
      )}
      {step === "Images" && (
        <ImagesPanel
          project={project}
          scenes={scenes ?? []}
          onJobStarted={(jobId) =>
            runJob("images", jobId, () => mutate(`/api/scenes/by-project/${projectId}`))
          }
        />
      )}
      {step === "Voice" && (
        <VoicePanel
          project={project}
          scenes={scenes ?? []}
          onJobStarted={(jobId) =>
            runJob("voice", jobId, () => mutate(`/api/scenes/by-project/${projectId}`))
          }
        />
      )}
      {step === "Video" && (
        <VideoPanel
          project={project}
          scenes={scenes ?? []}
          videos={videos ?? []}
          onJobStarted={(jobId) =>
            runJob("video", jobId, () => mutate(`/api/video/by-project/${projectId}`))
          }
        />
      )}
    </div>
  );
}
