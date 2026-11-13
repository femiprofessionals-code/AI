import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Play, Square, FolderOpen, ExternalLink, Trash2, CircleAlert, Cpu, Loader2 } from "lucide-react";
import { api, EVENTS } from "../lib/api";
import { useApp } from "../lib/appContext";
import { useLoad } from "../hooks/useLoad";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { useToast } from "../components/Toasts";
import { ErrorBox, Spinner } from "../components/Common";
import { fileUrl, formatDuration, formatWhen } from "../lib/format";
import type { Project, RenderJob } from "../lib/types";

const STATUS_TEXT: Record<string, string> = {
  queued: "Queued", running: "Rendering", succeeded: "Done", failed: "Failed", cancelled: "Cancelled",
};

export function JobRow({ job, compact, onCancel, onDelete }: { job: RenderJob; compact?: boolean; onCancel?: () => void; onDelete?: () => void }) {
  const toast = useToast();
  const active = job.status === "running" || job.status === "queued";
  return (
    <div className={`job job-${job.status} ${compact ? "compact" : ""}`}>
      <div className="job-top">
        <span className={`job-status st-${job.status}`}>
          {job.status === "running" && <Loader2 size={13} className="spin" />} {STATUS_TEXT[job.status]}
        </span>
        {!compact && <span className="muted small">{formatWhen(job.createdAt)} · {String(job.options?.quality ?? "")}</span>}
        <div className="spacer" />
        {job.status === "succeeded" && job.outputPath && job.outputExists && (
          <>
            <button className="icon-btn" title="Play in default video player" onClick={() => api.openPath(job.outputPath!).catch(toast.error)}><ExternalLink size={15} /></button>
            <button className="icon-btn" title="Show in folder" onClick={() => api.openPath(job.outputPath!, true).catch(toast.error)}><FolderOpen size={15} /></button>
          </>
        )}
        {active && onCancel && <button className="btn btn-sm" onClick={onCancel}><Square size={12} /> Cancel</button>}
        {!active && onDelete && <button className="icon-btn" title="Remove from history (keeps the video file)" onClick={onDelete}><Trash2 size={15} /></button>}
      </div>
      {active && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(job.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar" style={{ width: `${Math.max(2, job.progress * 100)}%` }} />
        </div>
      )}
      {active && !compact && <div className="muted small">{job.message} · {Math.round(job.progress * 100)}%</div>}
      {job.status === "failed" && job.error && !compact && <pre className="job-error">{job.error}</pre>}
      {job.status === "succeeded" && job.outputPath && !job.outputExists && !compact && <div className="muted small">The file was moved or deleted.</div>}
    </div>
  );
}

export function RenderTab({ project }: { project: Project }) {
  const { settings, status } = useApp();
  const toast = useToast();
  const engines = useLoad(() => api.enginesList(), [status?.ffmpegFound]);
  const { data: jobs, setData: setJobs, error, reload } = useLoad(() => api.jobsList(project.id), [project.id]);
  const [quality, setQuality] = useState<"720p" | "1080p">(settings?.renderQuality ?? "720p");
  const [starting, setStarting] = useState(false);

  useTauriEvent<RenderJob>(EVENTS.job, (job) => {
    if (job.projectId !== project.id) return;
    setJobs((list) => {
      const l = list ?? [];
      return l.some((j) => j.id === job.id) ? l.map((j) => (j.id === job.id ? job : j)) : [job, ...l];
    });
  });

  const latest = useMemo(() => jobs?.find((j) => j.status === "succeeded" && j.outputExists), [jobs]);
  const busy = jobs?.some((j) => j.status === "running" || j.status === "queued");

  const start = async (engineId: string) => {
    setStarting(true);
    try {
      const job = await api.renderStart(project.id, engineId, { quality });
      setJobs((l) => [job, ...(l ?? []).filter((j) => j.id !== job.id)]);
    } catch (e) {
      toast.error(e);
    } finally {
      setStarting(false);
    }
  };
  const cancel = async (j: RenderJob) => {
    try {
      const updated = await api.jobCancel(j.id);
      setJobs((l) => l?.map((x) => (x.id === j.id ? updated : x)));
    } catch (e) {
      toast.error(e);
    }
  };
  const del = async (j: RenderJob) => {
    try {
      await api.jobDelete(j.id);
      setJobs((l) => l?.filter((x) => x.id !== j.id));
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="render-layout">
      <div className="render-main">
        {(engines.data ?? []).map((e) => (
          <section key={e.id} className="panel">
            <div className="panel-head">
              <h2><Cpu size={16} /> {e.name}</h2>
              <span className="badge">{e.usesAi ? "Local AI model" : "No AI · FFmpeg"}</span>
            </div>
            <div className="pad">
              <p className="muted">{e.description}</p>
              {!e.available ? (
                <div className="notice notice-warn"><CircleAlert size={16} /> {e.unavailableReason} <Link to="/settings">Open Settings</Link></div>
              ) : (
                <div className="row gap wrap">
                  <label className="inline-field">
                    Quality
                    <select value={quality} onChange={(ev) => setQuality(ev.target.value as "720p" | "1080p")}>
                      <option value="720p">720p (faster, recommended)</option>
                      <option value="1080p">1080p (slower)</option>
                    </select>
                  </label>
                  <span className="muted small">{project.sceneCount} scenes · {formatDuration(project.totalDurationMs)} · {project.aspectRatio}</span>
                  <div className="spacer" />
                  <button className="btn btn-primary" disabled={starting || project.sceneCount === 0} onClick={() => start(e.id)}>
                    <Play size={16} /> {busy ? "Add to queue" : "Render draft"}
                  </button>
                </div>
              )}
              {project.sceneCount === 0 && <p className="muted small">Add scenes first — <Link to={`/projects/${project.id}/scenes`}>go to Scenes</Link>.</p>}
              <p className="muted small">Renders run one at a time at low priority with {settings?.renderThreads ?? 2} encoder thread{settings?.renderThreads === 1 ? "" : "s"}, so the app stays usable. Output goes to the project's <code>exports</code> folder.</p>
            </div>
          </section>
        ))}
        {engines.loading && !engines.data && <Spinner />}

        <section className="panel">
          <div className="panel-head"><h2>Render history</h2></div>
          {error && <ErrorBox message={error} onRetry={reload} />}
          {jobs && jobs.length === 0 && <p className="muted pad">No renders yet.</p>}
          <ul className="job-list">
            {jobs?.map((j) => (
              <li key={j.id}><JobRow job={j} onCancel={() => cancel(j)} onDelete={() => del(j)} /></li>
            ))}
          </ul>
        </section>
      </div>
      <aside className="render-side">
        <section className="panel">
          <div className="panel-head"><h2>Latest render</h2></div>
          {latest?.outputPath ? (
            <div className={`player ${project.aspectRatio === "9:16" ? "vertical" : ""}`}>
              <video key={latest.id} src={fileUrl(latest.outputPath, latest.finishedAt ?? undefined)} controls preload="metadata" />
              <div className="muted small pad-x">{formatWhen(latest.finishedAt)}</div>
            </div>
          ) : (
            <p className="muted pad">Your most recent successful render will play here.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
