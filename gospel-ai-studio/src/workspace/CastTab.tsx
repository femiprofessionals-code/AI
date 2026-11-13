import { useState } from "react";
import { Plus, Trash2, Users, Check, Pencil, X } from "lucide-react";
import { api } from "../lib/api";
import { useLoad } from "../hooks/useLoad";
import { useToast } from "../components/Toasts";
import { useConfirm } from "../components/Confirm";
import { EmptyState, ErrorBox, Spinner } from "../components/Common";
import type { Project, Speaker } from "../lib/types";

export function CastTab({ project }: { project: Project }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, setData, error, reload } = useLoad(() => api.speakersList(project.id), [project.id]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const add = async () => {
    if (!name.trim()) return;
    try {
      const s = await api.speakerCreate(project.id, { name, role });
      setData((d) => [...(d ?? []), s]);
      setName("");
      setRole("");
    } catch (e) {
      toast.error(e);
    }
  };
  const remove = async (s: Speaker) => {
    const r = await confirm({
      title: "Remove speaker?",
      message: s.sceneCount > 0
        ? <>{s.name} is assigned to {s.sceneCount} scene{s.sceneCount === 1 ? "" : "s"}. Those scenes will keep their text but lose the speaker.</>
        : <>Remove {s.name} from the cast?</>,
      confirmLabel: "Remove", danger: true,
    });
    if (!r.ok) return;
    try {
      await api.speakerDelete(s.id);
      setData((d) => d?.filter((x) => x.id !== s.id));
    } catch (e) {
      toast.error(e);
    }
  };

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Spinner />;

  return (
    <div className="narrow">
      <section className="panel">
        <div className="panel-head"><h2>Cast</h2><span className="muted small">People who speak in this conversation</span></div>
        <form className="row gap wrap pad" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input placeholder="Name (as written in the script, e.g. PASTOR JAMES)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="grow" />
          <input placeholder="Role (optional)" value={role} onChange={(e) => setRole(e.target.value)} />
          <button className="btn btn-primary" disabled={!name.trim()}><Plus size={16} /> Add speaker</button>
        </form>
        {data.length === 0 ? (
          <EmptyState icon={<Users size={28} />} title="No speakers yet">
            Add them here, or write “NAME: line” in the script and use “Create scenes from script” — new names are added automatically.
          </EmptyState>
        ) : (
          <ul className="cast-list">
            {data.map((s) => editing === s.id ? (
              <SpeakerEditor key={s.id} speaker={s} onCancel={() => setEditing(null)} onSaved={(n) => { setData((d) => d?.map((x) => (x.id === n.id ? n : x))); setEditing(null); }} />
            ) : (
              <li key={s.id} className="cast-row">
                <span className="swatch" style={{ background: s.color }} />
                <div className="grow">
                  <strong>{s.name}</strong>
                  <div className="muted small">{s.role || "No role set"} · {s.sceneCount} scene{s.sceneCount === 1 ? "" : "s"}</div>
                </div>
                <button className="icon-btn" title="Edit" onClick={() => setEditing(s.id)}><Pencil size={16} /></button>
                <button className="icon-btn danger" title="Remove" onClick={() => remove(s)}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SpeakerEditor({ speaker, onCancel, onSaved }: { speaker: Speaker; onCancel: () => void; onSaved: (s: Speaker) => void }) {
  const toast = useToast();
  const [name, setName] = useState(speaker.name);
  const [role, setRole] = useState(speaker.role);
  const [color, setColor] = useState(speaker.color);
  const save = async () => {
    try {
      onSaved(await api.speakerUpdate(speaker.id, { name, role, color }));
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <li className="cast-row editing">
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour" />
      <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Name" autoFocus />
      <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" aria-label="Role" className="grow" />
      <button className="icon-btn" title="Save" onClick={save}><Check size={16} /></button>
      <button className="icon-btn" title="Cancel" onClick={onCancel}><X size={16} /></button>
    </li>
  );
}
