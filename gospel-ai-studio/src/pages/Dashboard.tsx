import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessagesSquare, Megaphone, ImagePlus, Film, HardDrive, Clapperboard, CircleCheck, CircleAlert, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, EVENTS } from "../lib/api";
import { useLoad } from "../hooks/useLoad";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { useApp } from "../lib/appContext";
import { useToast } from "../components/Toasts";
import { EmptyState, ErrorBox, PageHeader, Spinner } from "../components/Common";
import { ProjectCard } from "../components/ProjectCard";
import { NewProjectDialog } from "../components/NewProjectDialog";
import { formatBytes, formatWhen } from "../lib/format";
import { MEDIA_FILTERS } from "./MediaLibrary";
import type { ProjectKind, RenderJob } from "../lib/types";
import { JobRow } from "../workspace/RenderTab";

export function DashboardPage() {
  const { data, error, loading, reload, setData } = useLoad(() => api.dashboard(), []);
  const { status, settings } = useApp();
  const [newKind, setNewKind] = useState<ProjectKind | null>(null);
  const toast = useToast();
  const nav = useNavigate();

  useTauriEvent<RenderJob>(EVENTS.job, (job) => {
    if (!data) return;
    const exists = data.recentJobs.some((j) => j.id === job.id);
    setData({ ...data, recentJobs: exists ? data.recentJobs.map((j) => (j.id === job.id ? job : j)) : [job, ...data.recentJobs].slice(0, 5) });
  });

  const importMedia = async () => {
    const picked = await open({ multiple: true, filters: MEDIA_FILTERS });
    if (!picked || (Array.isArray(picked) && picked.length === 0)) return;
    try {
      const r = await api.mediaImport(Array.isArray(picked) ? picked : [picked]);
      toast.success(`Imported ${r.imported.length} file${r.imported.length === 1 ? "" : "s"}`);
      if (r.skipped.length) toast.info(`Skipped: ${r.skipped.join("; ")}`);
      nav("/library");
    } catch (e) {
      toast.error(e);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="page">
      <PageHeader title={greeting} subtitle="Create Gospel Conversations and Hypeman videos — everything stays on this computer." />

      <section className="quick-actions">
        <button className="action-tile" onClick={() => setNewKind("conversation")}>
          <MessagesSquare size={22} />
          <div><strong>New Gospel Conversation</strong><span>Dialogue, testimony or study</span></div>
        </button>
        <button className="action-tile" onClick={() => setNewKind("hypeman")}>
          <Megaphone size={22} />
          <div><strong>New Gospel Hypeman</strong><span>Short, high-energy promo</span></div>
        </button>
        <button className="action-tile" onClick={importMedia}>
          <ImagePlus size={22} />
          <div><strong>Import media</strong><span>Images, video clips, voice and music</span></div>
        </button>
      </section>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (
        <>
          <section className="stats">
            <Stat icon={<MessagesSquare size={18} />} label="Conversations" value={data.conversationCount} to="/conversations" />
            <Stat icon={<Megaphone size={18} />} label="Hypeman projects" value={data.hypemanCount} to="/hypeman" />
            <Stat icon={<Film size={18} />} label="Scenes" value={data.sceneCount} />
            <Stat icon={<HardDrive size={18} />} label="Library"
              value={data.library.images + data.library.videos + data.library.audio}
              hint={`${formatBytes(data.library.totalBytes)} stored`} to="/library" />
          </section>

          <div className="dash-grid">
            <section className="panel">
              <div className="panel-head">
                <h2>Recent projects</h2>
              </div>
              {data.recentProjects.length === 0 ? (
                <EmptyState icon={<Clapperboard size={28} />} title="No projects yet">
                  Start with a Gospel Conversation or a Hypeman promo above.
                </EmptyState>
              ) : (
                <div className="card-grid">
                  {data.recentProjects.map((p) => <ProjectCard key={p.id} p={p} />)}
                </div>
              )}
            </section>

            <div className="dash-side">
              <section className="panel">
                <div className="panel-head"><h2>System</h2></div>
                <ul className="checklist">
                  <li>
                    {status?.ffmpegFound ? <CircleCheck size={16} className="ok" /> : <CircleAlert size={16} className="warn" />}
                    <div>
                      <strong>FFmpeg</strong>
                      <span className="muted small">{status?.ffmpegFound ? status.ffmpegVersion : "Needed for thumbnails and rendering. See Settings."}</span>
                    </div>
                  </li>
                  <li>
                    {status?.workspaceWritable ? <CircleCheck size={16} className="ok" /> : <CircleAlert size={16} className="warn" />}
                    <div>
                      <strong>Workspace folder</strong>
                      <span className="muted small path">{settings?.workspaceRoot}</span>
                    </div>
                    {settings && (
                      <button className="icon-btn" title="Open workspace folder" onClick={() => api.openPath(settings.workspaceRoot).catch(toast.error)}>
                        <FolderOpen size={16} />
                      </button>
                    )}
                  </li>
                  <li>
                    <CircleCheck size={16} className="ok" />
                    <div>
                      <strong>Offline mode</strong>
                      <span className="muted small">No account, cloud or paid API is used.</span>
                    </div>
                  </li>
                </ul>
              </section>

              <section className="panel">
                <div className="panel-head"><h2>Recent renders</h2></div>
                {data.recentJobs.length === 0 ? (
                  <p className="muted small pad">Renders appear here after you export a draft from a project's Render tab.</p>
                ) : (
                  <ul className="job-list compact">
                    {data.recentJobs.map((j) => (
                      <li key={j.id}>
                        <Link to={`/projects/${j.projectId}/render`} className="job-link">{j.projectTitle}</Link>
                        <JobRow job={j} compact />
                        <span className="muted small">{formatWhen(j.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
      {newKind && <NewProjectDialog kind={newKind} onClose={() => { setNewKind(null); void reload(); }} />}
    </div>
  );
}

function Stat({ icon, label, value, hint, to }: { icon: ReactNode; label: string; value: number; hint?: string; to?: string }) {
  const body = (
    <>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint muted small">{hint}</div>}
    </>
  );
  return to ? <Link to={to} className="stat card">{body}</Link> : <div className="stat card">{body}</div>;
}
