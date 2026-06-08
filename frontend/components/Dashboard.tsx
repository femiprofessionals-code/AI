"use client";

import useSWR from "swr";
import { Film, FolderOpen, HardDrive, Loader2 } from "lucide-react";
import { api, Dashboard } from "@/lib/api";
import { bytesToHuman } from "@/lib/utils";
import HealthBadge from "./HealthBadge";

const fetcher = (url: string) => api.get<Dashboard>(url);

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="card flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent grid place-items-center">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-ink-100/50">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </div>
    </div>
  );
}

export default function DashboardView() {
  const { data, isLoading } = useSWR("/api/dashboard", fetcher, { refreshInterval: 3000 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-ink-100/60 mt-1">Local processing only. Nothing leaves this machine.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat icon={FolderOpen} label="Projects" value={data ? String(data.projects) : "—"} />
        <Stat icon={Film} label="Videos exported" value={data ? String(data.videos) : "—"} />
        <Stat icon={HardDrive} label="Storage used" value={data ? bytesToHuman(data.storage_bytes) : "—"} />
        <Stat
          icon={Loader2}
          label="Queue"
          value={data ? `${data.queue_running} running / ${data.queue_pending} pending` : "—"}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h3 className="font-semibold mb-2">Get started</h3>
          <ol className="space-y-2 text-sm text-ink-100/70 list-decimal list-inside">
            <li>Create a project on the <a href="/projects" className="text-accent">Projects</a> page.</li>
            <li>Open it in the <a href="/studio" className="text-accent">Studio</a> and generate script, scenes, images, voice, and video.</li>
            <li>Make a thumbnail and export the MP4.</li>
          </ol>
          {isLoading && <div className="text-xs text-ink-100/40 mt-3">loading…</div>}
        </div>
        <HealthBadge />
      </div>
    </div>
  );
}
