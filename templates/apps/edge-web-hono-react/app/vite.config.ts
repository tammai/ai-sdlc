import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Cloudflare plugin runs the Worker (worker/index.ts, per wrangler.jsonc) inside workerd next to the Vite dev server,
// so `pnpm dev` serves the SPA and /api/* from one origin. Tests use vitest.config.ts instead.
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});
