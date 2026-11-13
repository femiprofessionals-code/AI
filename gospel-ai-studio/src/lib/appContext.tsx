import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Settings, SystemStatus } from "./types";

interface AppCtx {
  settings: Settings | null;
  setSettings: (s: Settings) => void;
  status: SystemStatus | null;
  refreshStatus: (redetect?: boolean) => Promise<SystemStatus | null>;
  loadError: string | null;
}

const Ctx = createContext<AppCtx>(null as unknown as AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshStatus = useCallback(async (redetect = false) => {
    try {
      const s = await api.systemStatus(redetect);
      setStatus(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    api.settingsGet().then(setSettings).catch((e) => setLoadError(String(e?.message ?? e)));
    void refreshStatus();
    // FFmpeg detection runs in the background at start-up; check again shortly.
    const t = setTimeout(() => void refreshStatus(), 2500);
    return () => clearTimeout(t);
  }, [refreshStatus]);

  // Theme
  useEffect(() => {
    const theme = settings?.theme ?? "system";
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [settings?.theme]);

  return <Ctx.Provider value={{ settings, setSettings, status, refreshStatus, loadError }}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
