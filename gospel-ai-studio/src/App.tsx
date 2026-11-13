import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { ToastProvider } from "./components/Toasts";
import { ConfirmProvider } from "./components/Confirm";
import { AppProvider, useApp } from "./lib/appContext";
import { flushAllAutosaves } from "./hooks/useAutosave";
import { DashboardPage } from "./pages/Dashboard";
import { ProjectsPage } from "./pages/Projects";
import { ProjectWorkspace } from "./pages/ProjectWorkspace";
import { MediaLibraryPage } from "./pages/MediaLibrary";
import { SettingsPage } from "./pages/Settings";
import { ErrorBox } from "./components/Common";

function Shell() {
  const { loadError } = useApp();
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        {loadError ? (
          <div className="page"><ErrorBox message={`Could not open the local database: ${loadError}`} /></div>
        ) : (
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/conversations" element={<ProjectsPage kind="conversation" />} />
            <Route path="/hypeman" element={<ProjectsPage kind="hypeman" />} />
            <Route path="/projects/:id" element={<ProjectWorkspace />} />
            <Route path="/projects/:id/:tab" element={<ProjectWorkspace />} />
            <Route path="/library" element={<MediaLibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<DashboardPage />} />
          </Routes>
        )}
      </main>
    </div>
  );
}

export function App() {
  // Make sure in-flight autosaves land before the window closes.
  useEffect(() => {
    let un: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async () => {
        await flushAllAutosaves();
      })
      .then((u) => (un = u))
      .catch(() => {});
    return () => un?.();
  }, []);

  return (
    <HashRouter>
      <AppProvider>
        <ToastProvider>
          <ConfirmProvider>
            <Shell />
          </ConfirmProvider>
        </ToastProvider>
      </AppProvider>
    </HashRouter>
  );
}
