import { useEffect, useState } from "react";
import { Plus, Search, MessagesSquare, Megaphone } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../hooks/useLoad";
import { EmptyState, ErrorBox, PageHeader, Spinner } from "../components/Common";
import { ProjectCard } from "../components/ProjectCard";
import { NewProjectDialog } from "../components/NewProjectDialog";
import type { ProjectKind, ProjectStatus } from "../lib/types";
import { STATUS_LABEL } from "../lib/format";

const COPY: Record<ProjectKind, { title: string; subtitle: string; empty: string }> = {
  conversation: {
    title: "Gospel Conversations",
    subtitle: "Dialogue-driven videos: write speaker lines, manage your cast and assemble scenes with recorded voices.",
    empty: "Write a script like “PASTOR: …” / “SEEKER: …” and the studio turns each turn into a scene.",
  },
  hypeman: {
    title: "Gospel Hypeman",
    subtitle: "Short, high-energy promos with punchy lines, a tempo and a music bed — vertical by default.",
    empty: "Each line of a Hypeman script becomes its own beat-sized scene.",
  },
};

export function ProjectsPage({ kind }: { kind: ProjectKind }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [status, setStatus] = useState<ProjectStatus | "">("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 200);
    return () => clearTimeout(t);
  }, [search]);
  const { data, error, loading, reload } = useLoad(
    () => api.projectsList({ kind, includeArchived: showArchived, search: debounced }),
    [kind, showArchived, debounced],
  );
  const list = (data ?? []).filter((p) => !status || p.status === status);
  const c = COPY[kind];
  const Icon = kind === "hypeman" ? Megaphone : MessagesSquare;

  return (
    <div className="page">
      <PageHeader
        title={c.title}
        subtitle={c.subtitle}
        actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New project</button>}
      />
      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input placeholder="Search projects" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | "")} aria-label="Filter by status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          <span>Show archived</span>
        </label>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? <Spinner /> : list.length === 0 ? (
        <EmptyState
          icon={<Icon size={30} />}
          title={debounced || status ? "No matching projects" : "No projects yet"}
          action={!debounced && !status ? <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Create your first project</button> : undefined}
        >
          {!debounced && !status ? c.empty : "Try a different search or filter."}
        </EmptyState>
      ) : (
        <div className="card-grid">
          {list.map((p) => <ProjectCard key={p.id} p={p} />)}
        </div>
      )}
      {creating && <NewProjectDialog kind={kind} onClose={() => { setCreating(false); void reload(); }} />}
    </div>
  );
}
