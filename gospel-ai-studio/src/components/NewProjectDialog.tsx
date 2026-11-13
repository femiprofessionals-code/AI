import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "./Modal";
import { api } from "../lib/api";
import { useApp } from "../lib/appContext";
import { useToast } from "./Toasts";
import type { AspectRatio, ProjectKind } from "../lib/types";
import { KIND_LABEL } from "../lib/format";

const HINT: Record<ProjectKind, string> = {
  conversation: "A dialogue between speakers, such as a pastor and a seeker, a testimony interview or a Bible-study discussion.",
  hypeman: "A short, high-energy promo: event hype, worship night teaser, sermon trailer or call to action.",
};

export function NewProjectDialog({ kind: initialKind, onClose }: { kind?: ProjectKind; onClose: () => void }) {
  const { settings } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const [kind, setKind] = useState<ProjectKind>(initialKind ?? "conversation");
  const defaultAspect = (k: ProjectKind): AspectRatio =>
    (k === "hypeman" ? settings?.defaultAspectHypeman : settings?.defaultAspectConversation) ?? (k === "hypeman" ? "9:16" : "16:9");
  const [aspect, setAspect] = useState<AspectRatio>(defaultAspect(kind));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const p = await api.projectCreate({ kind, title, description, aspectRatio: aspect });
      toast.success(`Created “${p.title}”`);
      onClose();
      nav(`/projects/${p.id}/script`);
    } catch (e) {
      toast.error(e);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!title.trim() || busy} onClick={create}>
            {busy ? "Creating…" : "Create project"}
          </button>
        </>
      }
    >
      <form className="form" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <div className="seg" role="radiogroup" aria-label="Project type">
          {(["conversation", "hypeman"] as ProjectKind[]).map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={kind === k}
              className={`seg-btn ${kind === k ? "on" : ""}`}
              onClick={() => { setKind(k); setAspect(defaultAspect(k)); }}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="muted small">{HINT[kind]}</p>
        <label className="field">
          <span>Title</span>
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "hypeman" ? "Youth Revival Night – Promo" : "Grace for the Prodigal"} />
        </label>
        <label className="field">
          <span>Description <em className="muted">(optional)</em></span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="field">
          <span>Aspect ratio</span>
          <select value={aspect} onChange={(e) => setAspect(e.target.value as AspectRatio)}>
            <option value="16:9">16:9 · Landscape (YouTube)</option>
            <option value="9:16">9:16 · Vertical (Reels, Shorts, TikTok)</option>
            <option value="1:1">1:1 · Square</option>
          </select>
        </label>
      </form>
    </Modal>
  );
}
