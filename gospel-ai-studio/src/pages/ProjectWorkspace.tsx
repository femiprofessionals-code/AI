import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FolderOpen, Archive, ArchiveRestore, Trash2, FileText, Film, Users, Gauge, Clapperboard } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../hooks/useLoad";
import { useToast } from "../components/Toasts";
import { useConfirm } from "../components/Confirm";
import { ErrorBox, Spinner } from "../components/Common";
import { formatDuration, STATUS_LABEL } from "../lib/format";
import type { Project } from "../lib/types";
import { ScriptTab } from "../workspace/ScriptTab";
import { ScenesTab } from "../workspace/ScenesTab";
import { CastTab } from "../workspace/CastTab";
import { HypeTab } from "../workspace/HypeTab";
import { RenderTab } from "../workspace/RenderTab";

export function ProjectWorkspace() {
  const { id = "", tab = "script" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: project, setData: setProject, error, reload } = useLoad(() => api.projectGet(id), [id]);

  const update = async (patch: Parameters<typeof api.projectUpdate>[1]) => {
    try {
      setProject(await api.projectUpdate(id, patch));
    } catch (e) {
      toast.error(e);
    }
  };
  const refresh = () => api.projectGet(id).then(setProject).catch(() => {});

  if (error) return <div className="page"><ErrorBox message={error} onRetry={reload} /><Link to="/" className="btn">Back to dashboard</Link></div>;
  if (!project) return <div className="page"><Spinner /></div>;

  const back = project.kind === "hypeman" ? "/hypeman" : "/conversations";
  const tabs = [
    { key: "script", label: "Script", icon: FileText },
    { key: "scenes", label: "Scenes", icon: Film },
    project.kind === "conversation"
      ? { key: "cast", label: "Cast", icon: Users }
      : { key: "hype", label: "Tempo & Music", icon: Gauge },
    { key: "render", label: "Render", icon: Clapperboard },
  ];

  const toggleArchive = async () => {
    try {
      const p = await api.projectSetArchived(id, !project.archived);
      setProject(p);
      toast.success(p.archived ? "Project archived" : "Project restored");
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async () => {
    const r = await confirm({
      title: "Delete project?",
      message: <>This permanently removes <strong>{project.title}</strong>, its script, scenes, cast and render history from the database. Media in your library is kept.</>,
      checkbox: "Also delete the project folder (script.txt and rendered videos) from disk",
      confirmLabel: "Delete project",
      danger: true,
    });
    if (!r.ok) return;
    try {
      const removed = await api.projectDelete(id, r.checked);
      toast.success(r.checked && removed ? "Project and files deleted" : "Project deleted");
      nav(back);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="page workspace">
      <header className="ws-head">
        <Link to={back} className="back-link"><ArrowLeft size={16} /> {project.kind === "hypeman" ? "Gospel Hypeman" : "Gospel Conversations"}</Link>
        <div className="ws-title-row">
          <TitleEditor project={project} onSave={(title) => update({ title })} />
          <div className="ws-actions">
            <select value={project.status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={project.aspectRatio} onChange={(e) => update({ aspectRatio: e.target.value })} aria-label="Aspect ratio">
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
            </select>
            <button className="icon-btn" title="Open project folder" onClick={() => api.openPath(project.folderPath).catch(toast.error)}><FolderOpen size={18} /></button>
            <button className="icon-btn" title={project.archived ? "Restore from archive" : "Archive"} onClick={toggleArchive}>
              {project.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
            </button>
            <button className="icon-btn danger" title="Delete project" onClick={remove}><Trash2 size={18} /></button>
          </div>
        </div>
        <div className="ws-sub muted small">
          {project.sceneCount} scenes · {formatDuration(project.totalDurationMs)} · {project.wordCount} words
          {project.archived && <span className="badge">Archived</span>}
        </div>
        <nav className="tabs" role="tablist">
          {tabs.map(({ key, label, icon: Icon }) => (
            <NavLink key={key} to={`/projects/${id}/${key}`} role="tab" className={() => `tab ${tab === key ? "active" : ""}`}>
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="ws-body">
        {tab === "script" && <ScriptTab project={project} onChanged={refresh} />}
        {tab === "scenes" && <ScenesTab project={project} onChanged={refresh} />}
        {tab === "cast" && project.kind === "conversation" && <CastTab project={project} />}
        {tab === "hype" && project.kind === "hypeman" && <HypeTab project={project} onUpdate={update} onChanged={refresh} />}
        {tab === "render" && <RenderTab project={project} />}
      </div>
    </div>
  );
}

function TitleEditor({ project, onSave }: { project: Project; onSave: (t: string) => void }) {
  const [value, setValue] = useState(project.title);
  useEffect(() => setValue(project.title), [project.title]);
  const commit = () => {
    const t = value.trim();
    if (!t) setValue(project.title);
    else if (t !== project.title) onSave(t);
  };
  return (
    <input
      className="title-input"
      value={value}
      maxLength={120}
      aria-label="Project title"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setValue(project.title); (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}
