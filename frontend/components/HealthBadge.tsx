"use client";

import useSWR from "swr";
import { api, Health } from "@/lib/api";
import { CheckCircle2, XCircle } from "lucide-react";

const fetcher = (url: string) => api.get<Health>(url);

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-ink-100/70">{label}</span>
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
      ) : (
        <XCircle className="w-4 h-4 text-red-400" />
      )}
    </div>
  );
}

export default function HealthBadge() {
  const { data, isLoading } = useSWR("/api/health", fetcher, { refreshInterval: 5000 });
  if (isLoading || !data) return <div className="card">Checking services…</div>;
  return (
    <div className="card">
      <h3 className="font-semibold mb-3">System health</h3>
      <Row label="API" ok={data.api} />
      <Row label="Ollama" ok={data.ollama} />
      <Row label="LLM model present" ok={data.ollama_model_present} />
      <Row label="Piper TTS" ok={data.piper} />
      <Row label="Whisper" ok={data.whisper} />
      <Row label="FFmpeg" ok={data.ffmpeg} />
      <div className="mt-3 text-xs text-ink-100/50">
        Disk free: <span className="text-ink-100/80">{data.disk_free_gb} GB</span>
      </div>
    </div>
  );
}
