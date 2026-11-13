import { useEffect, useState } from "react";
import { FolderOpen, RefreshCw, Save, DatabaseBackup, CircleCheck, CircleAlert, Info } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import { useApp } from "../lib/appContext";
import { useLoad } from "../hooks/useLoad";
import { useToast } from "../components/Toasts";
import { PageHeader, Spinner } from "../components/Common";
import type { Settings } from "../lib/types";

export function SettingsPage() {
  const { settings, setSettings, status, refreshStatus } = useApp();
  const toast = useToast();
  const info = useLoad(() => api.appInfo(), [settings?.workspaceRoot]);
  const [form, setForm] = useState<Settings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  if (!form || !settings) return <div className="page"><Spinner /></div>;

  const dirty = JSON.stringify(form) !== JSON.stringify(settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      const s = await api.settingsSave(form);
      setSettings(s);
      setForm(s);
      await refreshStatus();
      toast.success("Settings saved");
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };
  const chooseFolder = async () => {
    const dir = await open({ directory: true, defaultPath: form.workspaceRoot });
    if (typeof dir === "string") set("workspaceRoot", dir);
  };
  const chooseFile = async (key: "ffmpegPath" | "renderFontPath", filters: { name: string; extensions: string[] }[]) => {
    const f = await open({ multiple: false, filters: filters.length ? filters : undefined });
    if (typeof f === "string") set(key, f);
  };
  const detect = async () => {
    setDetecting(true);
    const s = await refreshStatus(true);
    setDetecting(false);
    if (s?.ffmpegFound) toast.success("FFmpeg found");
    else toast.info("FFmpeg still not found");
  };
  const backup = async () => {
    try {
      const path = await api.dbBackup();
      toast.success("Backup saved");
      void api.openPath(path, true).catch(() => {});
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="page settings">
      <PageHeader title="Settings"
        actions={<button className="btn btn-primary" disabled={!dirty || saving} onClick={save}><Save size={16} /> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>} />

      <section className="panel">
        <div className="panel-head"><h2>Storage</h2></div>
        <div className="pad form">
          <label className="field">
            <span>Workspace folder</span>
            <div className="row gap">
              <input className="grow" value={form.workspaceRoot} onChange={(e) => set("workspaceRoot", e.target.value)} />
              <button className="btn" onClick={chooseFolder}><FolderOpen size={15} /> Browse…</button>
            </div>
            <span className="muted small">Projects, the media library and backups live here, outside the app’s install folder. Existing projects stay where they were created; only new ones use a changed folder.</span>
          </label>
          <label className="field">
            <span>When importing media</span>
            <select value={form.importMode} onChange={(e) => set("importMode", e.target.value as Settings["importMode"])}>
              <option value="copy">Copy files into the library (safe if originals move)</option>
              <option value="link">Link to files where they are (saves disk space)</option>
            </select>
          </label>
          <div className="row gap wrap">
            <button className="btn" onClick={backup}><DatabaseBackup size={15} /> Back up database now</button>
            <span className="muted small">Saves a copy of the project database into <code>Backups</code> in your workspace.</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Writing</h2></div>
        <div className="pad form grid-2">
          <label className="field">
            <span>Autosave delay (ms)</span>
            <input type="number" className="num" min={300} max={10000} step={100} value={form.autosaveDelayMs} onChange={(e) => set("autosaveDelayMs", Number(e.target.value))} />
          </label>
          <span />
          <label className="field">
            <span>Speaking pace — Conversations (words/min)</span>
            <input type="number" className="num" min={60} max={320} value={form.wordsPerMinuteConversation} onChange={(e) => set("wordsPerMinuteConversation", Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Speaking pace — Hypeman (words/min)</span>
            <input type="number" className="num" min={60} max={320} value={form.wordsPerMinuteHypeman} onChange={(e) => set("wordsPerMinuteHypeman", Number(e.target.value))} />
          </label>
          <label className="field">
            <span>Default aspect — Conversations</span>
            <select value={form.defaultAspectConversation} onChange={(e) => set("defaultAspectConversation", e.target.value as Settings["defaultAspectConversation"])}>
              <option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option>
            </select>
          </label>
          <label className="field">
            <span>Default aspect — Hypeman</span>
            <select value={form.defaultAspectHypeman} onChange={(e) => set("defaultAspectHypeman", e.target.value as Settings["defaultAspectHypeman"])}>
              <option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Rendering & FFmpeg</h2></div>
        <div className="pad form">
          <div className={`notice ${status?.ffmpegFound ? "notice-ok" : "notice-warn"}`}>
            {status?.ffmpegFound ? <CircleCheck size={16} /> : <CircleAlert size={16} />}
            <div>
              {status?.ffmpegFound ? <><strong>FFmpeg found</strong> — {status.ffmpegVersion}<div className="muted small path">{status.ffmpegPath}{status.ffprobeFound ? "" : " · ffprobe missing (durations unavailable)"}</div></>
                : <><strong>FFmpeg not found.</strong> Install it once (free, open source), then click Detect. In PowerShell: <code>winget install Gyan.FFmpeg</code> — or download a build, unzip it and choose <code>bin\ffmpeg.exe</code> below.</>}
            </div>
            <button className="btn btn-sm" onClick={detect} disabled={detecting}><RefreshCw size={14} className={detecting ? "spin" : ""} /> Detect</button>
          </div>
          <label className="field">
            <span>FFmpeg executable <em className="muted">(leave empty to auto-detect)</em></span>
            <div className="row gap">
              <input className="grow" value={form.ffmpegPath} placeholder="Auto-detect" onChange={(e) => set("ffmpegPath", e.target.value)} />
              <button className="btn" onClick={() => chooseFile("ffmpegPath", [])}>Browse…</button>
            </div>
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Default render quality</span>
              <select value={form.renderQuality} onChange={(e) => set("renderQuality", e.target.value as Settings["renderQuality"])}>
                <option value="720p">720p — recommended for this hardware</option>
                <option value="1080p">1080p — about twice as slow</option>
              </select>
            </label>
            <label className="field">
              <span>Encoder threads</span>
              <input type="number" className="num" min={1} max={16} value={form.renderThreads} onChange={(e) => set("renderThreads", Number(e.target.value))} />
              <span className="muted small">2 keeps a dual-core laptop responsive while rendering{info.data ? ` (this PC reports ${info.data.cpuThreads} threads)` : ""}.</span>
            </label>
          </div>
          <label className="field">
            <span>Font for text cards <em className="muted">(leave empty to use Segoe UI / Arial)</em></span>
            <div className="row gap">
              <input className="grow" value={form.renderFontPath} placeholder={status?.fontFound ? "Auto (system font found)" : "No system font found — choose a .ttf"} onChange={(e) => set("renderFontPath", e.target.value)} />
              <button className="btn" onClick={() => chooseFile("renderFontPath", [{ name: "Fonts", extensions: ["ttf", "otf"] }])}>Browse…</button>
            </div>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Appearance</h2></div>
        <div className="pad form">
          <div className="seg">
            {(["system", "dark", "light"] as const).map((t) => (
              <button key={t} className={`seg-btn ${form.theme === t ? "on" : ""}`} onClick={() => set("theme", t)}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2><Info size={16} /> About</h2></div>
        <div className="pad">
          <dl className="kv">
            <dt>Version</dt><dd>{info.data?.version ?? "…"}</dd>
            <dt>Database</dt><dd className="path">{info.data?.dbPath} (schema v{info.data?.schemaVersion})</dd>
            <dt>Network</dt><dd>Not required. The app makes no internet requests and sends no files anywhere.</dd>
            <dt>AI models</dt><dd>None are installed or running in this version. Rendering uses FFmpeg only. Local AI engines can be added later; they will only appear once they are actually installed and working.</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}
