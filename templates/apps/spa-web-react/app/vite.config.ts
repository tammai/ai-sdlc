import path from "node:path";
import process from "node:process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Dev (and `vite preview`): same contract as the Worker — /api/* goes to the Go API with the /api prefix stripped.
// The API's allowed origins must include http://localhost:5173 (cookie CSRF check).
const apiProxy = {
  "/api": {
    target: process.env.DEV_API_URL || "__API_URL__",
    changeOrigin: true,
    xfwd: true,
    rewrite: (p: string) => p.replace(/^\/api/, "") || "/",
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  build: { outDir: "dist" },
  test: {
    environment: "jsdom", // worker/*.test.ts opts into node with `// @vitest-environment node`
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "worker/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
