"use client";

import useSWR from "swr";
import Link from "next/link";
import { api, Project, VideoExport } from "@/lib/api";
import { bytesToHuman, secondsToHMS } from "@/lib/utils";

export default function ExportsPage() {
  const { data: projects } = useSWR<Project[]>("/api/projects", (u) => api.get(u));
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Exports</h1>
      {projects?.map((p) => <ProjectExports key={p.id} project={p} />)}
      {projects && projects.length === 0 && <div className="text-ink-100/50">No projects yet.</div>}
    </div>
  );
}

function ProjectExports({ project }: { project: Project }) {
  const { data } = useSWR<VideoExport[]>(`/api/video/by-project/${project.id}`, (u) => api.get(u));
  if (!data?.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{project.name}</h2>
        <Link className="text-accent text-sm" href={`/studio/${project.id}`}>open</Link>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {data.map((v) => (
          <div key={v.id} className="card space-y-2">
            <div className="text-sm text-ink-100/70 flex flex-wrap gap-3">
              <span>{v.width}×{v.height}</span>
              <span>{v.fps}fps</span>
              <span>{secondsToHMS(v.duration_sec)}</span>
              <span>{bytesToHuman(v.size_bytes)}</span>
            </div>
            <a className="btn-secondary text-sm" href={`/api/video/${v.id}/download`}>Download MP4</a>
          </div>
        ))}
      </div>
    </section>
  );
}
