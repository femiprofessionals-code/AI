import { NavLink } from "react-router-dom";
import { LayoutDashboard, MessagesSquare, Megaphone, Images, Settings as Cog, CircleCheck, CircleAlert, WifiOff } from "lucide-react";
import { useApp } from "../lib/appContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/conversations", label: "Gospel Conversations", icon: MessagesSquare },
  { to: "/hypeman", label: "Gospel Hypeman", icon: Megaphone },
  { to: "/library", label: "Media Library", icon: Images },
  { to: "/settings", label: "Settings", icon: Cog },
];

export function Sidebar() {
  const { status } = useApp();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          <svg viewBox="0 0 32 32" width="30" height="30">
            <rect x="1" y="1" width="30" height="30" rx="7" fill="var(--brand-bg)" stroke="var(--accent)" strokeWidth="1.5" />
            <rect x="14.2" y="5.5" width="3.6" height="21" rx="1" fill="var(--accent)" />
            <rect x="8.8" y="10.6" width="14.4" height="3.4" rx="1" fill="var(--accent)" />
          </svg>
        </div>
        <div>
          <div className="brand-name">Gospel AI Studio</div>
          <div className="brand-sub">Offline production suite</div>
        </div>
      </div>
      <nav className="nav">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <Icon size={18} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="foot-row" title="Gospel AI Studio never uploads your files. No account or internet connection is required.">
          <WifiOff size={14} /> <span>Local only · no cloud</span>
        </div>
        <NavLink to="/settings" className="foot-row foot-link" title={status?.ffmpegPath ?? "FFmpeg not found"}>
          {status?.ffmpegFound ? <CircleCheck size={14} className="ok" /> : <CircleAlert size={14} className="warn" />}
          <span>{status == null ? "Checking FFmpeg…" : status.ffmpegFound ? "FFmpeg ready" : "FFmpeg not found"}</span>
        </NavLink>
      </div>
    </aside>
  );
}
