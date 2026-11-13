import { Link } from "react-router-dom";
import { MessagesSquare, Megaphone, Clock, Film, Archive } from "lucide-react";
import type { Project } from "../lib/types";
import { formatDuration, formatWhen, STATUS_LABEL } from "../lib/format";

export function ProjectCard({ p }: { p: Project }) {
  const Icon = p.kind === "hypeman" ? Megaphone : MessagesSquare;
  return (
    <Link to={`/projects/${p.id}`} className={`card project-card ${p.archived ? "is-archived" : ""}`}>
      <div className="project-card-top">
        <span className={`kind-chip kind-${p.kind}`}><Icon size={14} /> {p.kind === "hypeman" ? "Hypeman" : "Conversation"}</span>
        <span className={`status status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
      </div>
      <h3 className="project-title">{p.title}</h3>
      {p.description && <p className="muted clamp-2">{p.description}</p>}
      <div className="project-meta">
        <span><Film size={13} /> {p.sceneCount} scene{p.sceneCount === 1 ? "" : "s"}</span>
        <span><Clock size={13} /> {formatDuration(p.totalDurationMs)}</span>
        <span>{p.aspectRatio}</span>
        {p.archived && <span><Archive size={13} /> Archived</span>}
      </div>
      <div className="project-foot muted small">Edited {formatWhen(p.updatedAt)}</div>
    </Link>
  );
}
