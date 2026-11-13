import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, Wand2, Camera, RotateCcw, Eye, Keyboard } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/appContext";
import { useAutosave } from "../hooks/useAutosave";
import { useLoad } from "../hooks/useLoad";
import { useToast } from "../components/Toasts";
import { useConfirm } from "../components/Confirm";
import { ErrorBox, SaveIndicator, Spinner } from "../components/Common";
import { Modal } from "../components/Modal";
import { scriptStats } from "../lib/scriptStats";
import { formatDuration, formatWhen } from "../lib/format";
import type { Project, Revision, Speaker } from "../lib/types";

const PLACEHOLDER: Record<string, string> = {
  conversation: `# Opening
(Warm light, two chairs facing each other)
PASTOR JAMES: Welcome. What's been on your heart this week?

SEEKER: Honestly? I keep wondering if God could forgive what I've done.

PASTOR JAMES: Let's read Luke 15 together…`,
  hypeman: `# Intro
ARE YOU READY?!
(beat drop)
This Friday — Youth Revival Night!
Worship. Word. Fire.
# Call to action
Bring a friend. 7 PM. Grace Chapel.
Say AMEN!`,
};

export function ScriptTab({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const { settings } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  const { data: doc, error, reload } = useLoad(() => api.scriptGet(project.id), [project.id]);
  const speakers = useLoad<Speaker[]>(
    () => (project.kind === "conversation" ? api.speakersList(project.id) : Promise.resolve([])),
    [project.id],
  );
  const [text, setText] = useState<string | null>(null);
  const [showRevisions, setShowRevisions] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (doc && text === null) setText(doc.content);
  }, [doc, text]);

  const autosave = useAutosave<string>(async (content) => {
    await api.scriptSave(project.id, content);
    onChanged();
  }, settings?.autosaveDelayMs ?? 800);

  const wpm = project.kind === "hypeman" ? settings?.wordsPerMinuteHypeman ?? 170 : settings?.wordsPerMinuteConversation ?? 150;
  const stats = useMemo(() => scriptStats(text ?? "", project.kind, wpm), [text, project.kind, wpm]);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void autosave.flush();
    }
  };

  const insertSpeaker = (name: string) => {
    const el = area.current;
    if (!el || text === null) return;
    const start = el.selectionStart;
    const before = text.slice(0, start);
    const prefix = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const ins = `${prefix}${name}: `;
    const next = before + ins + text.slice(el.selectionEnd);
    setText(next);
    autosave.update(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + ins.length;
    });
  };

  const generate = async () => {
    await autosave.flush();
    let replace = true;
    if (project.sceneCount > 0) {
      const r = await confirm({
        title: "Create scenes from script",
        message: <>This project already has {project.sceneCount} scene{project.sceneCount === 1 ? "" : "s"}. Replacing them removes their media assignments and notes.</>,
        checkbox: "Keep existing scenes and add the new ones after them",
        confirmLabel: "Create scenes",
      });
      if (!r.ok) return;
      replace = !r.checked;
    }
    try {
      const res = await api.scenesGenerate(project.id, replace);
      toast.success(`Created ${res.created} scene${res.created === 1 ? "" : "s"}${res.speakersCreated ? ` and ${res.speakersCreated} new speaker${res.speakersCreated === 1 ? "" : "s"}` : ""}`);
      onChanged();
      nav(`/projects/${project.id}/scenes`);
    } catch (e) {
      toast.error(e);
    }
  };

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (text === null) return <Spinner />;

  return (
    <div className="script-layout">
      <div className="editor-col">
        <div className="editor-bar">
          <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} error={autosave.error} />
          <div className="spacer" />
          {project.kind === "conversation" && (speakers.data?.length ?? 0) > 0 && (
            <div className="speaker-chips" aria-label="Insert speaker">
              {speakers.data!.map((s) => (
                <button key={s.id} className="chip" style={{ borderColor: s.color }} onClick={() => insertSpeaker(s.name)} title={`Insert “${s.name}:”`}>
                  <span className="dot" style={{ background: s.color }} /> {s.name}
                </button>
              ))}
            </div>
          )}
          <button className="btn btn-sm" onClick={() => setShowRevisions(true)}><History size={15} /> History</button>
        </div>
        <textarea
          ref={area}
          className="script-editor"
          spellCheck
          autoFocus={doc?.content === ""}
          value={text}
          placeholder={PLACEHOLDER[project.kind]}
          onKeyDown={onKey}
          onChange={(e) => {
            setText(e.target.value);
            autosave.update(e.target.value);
          }}
          onBlur={() => void autosave.flush()}
        />
      </div>

      <aside className="script-side">
        <section className="panel">
          <div className="panel-head"><h2>Script overview</h2></div>
          <dl className="kv">
            <dt>Words</dt><dd>{stats.words}</dd>
            <dt>Spoken length</dt><dd>≈ {formatDuration(stats.estimatedMs)} <span className="muted small">at {wpm} wpm</span></dd>
            <dt>{project.kind === "hypeman" ? "Beats" : "Speaking turns"}</dt><dd>{stats.beats}</dd>
            {project.kind === "hypeman" && project.targetSeconds && (
              <><dt>Target</dt><dd>{formatDuration(project.targetSeconds * 1000)}{stats.estimatedMs > project.targetSeconds * 1000 && <span className="warn small"> · over target</span>}</dd></>
            )}
          </dl>
          {project.kind === "conversation" && stats.speakers.length > 0 && (
            <div className="speaker-stats">
              {stats.speakers.map((s) => (
                <div key={s.name} className="speaker-stat">
                  <span>{s.name}</span>
                  <span className="muted small">{s.lines} turn{s.lines === 1 ? "" : "s"} · {s.words} words</span>
                </div>
              ))}
            </div>
          )}
          <button className="btn btn-primary block" disabled={stats.beats === 0} onClick={generate}>
            <Wand2 size={16} /> Create scenes from script
          </button>
          <p className="muted small">Splits the script with simple text rules (no AI): {project.kind === "conversation" ? "each speaker turn" : "each line"} becomes a scene with an estimated duration.</p>
        </section>

        <section className="panel">
          <div className="panel-head"><h2><Keyboard size={15} /> Format guide</h2></div>
          <ul className="guide">
            <li><code># Heading</code> names the next scene</li>
            {project.kind === "conversation"
              ? <li><code>NAME: line</code> starts a speaker turn; following lines continue it; a blank line ends it</li>
              : <li>Every line is one beat; <code>NAME: line</code> keeps the name in the text</li>}
            <li><code>(direction)</code> is saved as scene notes</li>
            <li><kbd>Ctrl</kbd>+<kbd>S</kbd> saves immediately; edits also save automatically</li>
          </ul>
        </section>
      </aside>

      {showRevisions && (
        <RevisionsDialog
          projectId={project.id}
          onClose={() => setShowRevisions(false)}
          beforeAction={() => autosave.flush()}
          onRestored={(content) => {
            setText(content);
            setShowRevisions(false);
            onChanged();
            toast.success("Revision restored");
          }}
        />
      )}
    </div>
  );
}

function RevisionsDialog({ projectId, onClose, onRestored, beforeAction }: {
  projectId: string; onClose: () => void; onRestored: (c: string) => void; beforeAction: () => Promise<void>;
}) {
  const toast = useToast();
  const { data, setData, error, loading } = useLoad(() => api.scriptRevisions(projectId), [projectId]);
  const [preview, setPreview] = useState<{ rev: Revision; content: string } | null>(null);

  const snapshot = async () => {
    try {
      await beforeAction();
      setData(await api.scriptSnapshot(projectId));
      toast.success("Snapshot saved");
    } catch (e) {
      toast.error(e);
    }
  };
  const restore = async (rev: Revision) => {
    try {
      await beforeAction();
      const doc = await api.scriptRestore(projectId, rev.id);
      onRestored(doc.content);
    } catch (e) {
      toast.error(e);
    }
  };
  const view = async (rev: Revision) => {
    try {
      setPreview({ rev, content: await api.scriptRevisionContent(rev.id) });
    } catch (e) {
      toast.error(e);
    }
  };
  const label = { auto: "Automatic", manual: "Snapshot", before_restore: "Before restore" };

  return (
    <Modal title="Script history" onClose={onClose} wide
      footer={<><button className="btn" onClick={snapshot}><Camera size={15} /> Save snapshot now</button><button className="btn btn-primary" onClick={onClose}>Done</button></>}>
      <p className="muted small">The studio keeps an automatic copy at most every 5 minutes while you write (last 30 kept), plus every snapshot you save. Restoring keeps your current text in history too.</p>
      {error && <ErrorBox message={error} />}
      {loading && !data && <Spinner />}
      <div className="rev-layout">
        <ul className="rev-list">
          {data?.length === 0 && <li className="muted">No history yet. Start writing — a first copy is kept automatically.</li>}
          {data?.map((r) => (
            <li key={r.id} className={preview?.rev.id === r.id ? "active" : ""}>
              <div>
                <strong>{formatWhen(r.createdAt)}</strong> <span className="badge">{label[r.reason]}</span>
                <div className="muted small">{r.wordCount} words · {new Date(r.createdAt).toLocaleString()}</div>
              </div>
              <div className="row-actions">
                <button className="icon-btn" title="Preview" onClick={() => view(r)}><Eye size={16} /></button>
                <button className="icon-btn" title="Restore this version" onClick={() => restore(r)}><RotateCcw size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
        <pre className="rev-preview">{preview ? preview.content || "(empty)" : "Select a version to preview it."}</pre>
      </div>
    </Modal>
  );
}
