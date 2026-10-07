import { app } from "./app";

// Worker entry (wrangler.jsonc `main`). Only /api/* reaches it (assets.run_worker_first); the SPA is served as static assets.
export default app;
