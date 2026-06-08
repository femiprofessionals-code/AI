"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Film, FolderOpen, Image as ImageIcon, LayoutDashboard, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/studio", label: "Studio", icon: Sparkles },
  { href: "/exports", label: "Exports", icon: Film },
  { href: "/thumbnails", label: "Thumbnails", icon: ImageIcon },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-white/5 bg-ink-900/50 p-4 hidden md:block">
      <div className="flex items-center gap-2 px-2 py-4 mb-4">
        <div className="w-8 h-8 rounded-lg bg-accent grid place-items-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="font-semibold text-ink-50">AI Content Studio</div>
      </div>
      <nav className="space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors",
                active
                  ? "bg-accent text-white"
                  : "text-ink-100/70 hover:text-ink-50 hover:bg-white/5",
              )}
            >
              <Icon className="w-4 h-4" /> {label}
            </Link>
          );
        })}
      </nav>
      <div className="text-xs text-ink-100/40 mt-10 px-2">
        v0.1 · local-only · no cloud
      </div>
    </aside>
  );
}
