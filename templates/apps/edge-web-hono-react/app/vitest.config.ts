import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  "@shared": path.resolve(import.meta.dirname, "shared"),
};

export default defineConfig({
  test: {
    projects: [
      {
        // API routes: the real Hono app over a local D1 (workerd via wrangler's getPlatformProxy) — offline, no account.
        resolve: { alias },
        test: {
          name: "worker",
          environment: "node",
          include: ["test/worker/**/*.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        // Components and pages: jsdom + Testing Library with a stubbed fetch.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: [path.resolve(import.meta.dirname, "src/test-setup.ts")],
        },
      },
    ],
  },
});
