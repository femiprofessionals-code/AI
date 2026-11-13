/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port and must not clear the terminal.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // WebView2 on Windows 10/11 is evergreen Chromium.
    target: "chrome105",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
