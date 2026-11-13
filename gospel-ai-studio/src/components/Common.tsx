import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { SaveState } from "../hooks/useAutosave";
import { formatClock } from "../lib/format";

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="spinner"><Loader2 className="spin" size={18} /> {label}</div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box">
      <span>{message}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function SaveIndicator({ state, savedAt, error }: { state: SaveState; savedAt: Date | null; error?: string | null }) {
  const text =
    state === "pending" ? "Unsaved changes…" :
    state === "saving" ? "Saving…" :
    state === "error" ? `Not saved: ${error ?? "error"}` :
    savedAt ? `Saved ${formatClock(savedAt)}` : "All changes saved";
  return <span className={`save-ind save-${state}`} title={error ?? undefined}>{text}</span>;
}

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  );
}
