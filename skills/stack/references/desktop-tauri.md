# Profile: tauri — desktop app, Rust as the BFF

**Stack:** Tauri v2 · frontend = Nuxt 4 SPA (`ssr: false`, `nuxt generate`) + Nuxt UI + Tailwind v4 (default) or Vite + React + shadcn/ui · Rust commands are the BFF: all network, filesystem, secrets and local DB go through them · `reqwest` for the Go API (when present) · `keyring` for tokens · SQLite via `sqlx` (or `tauri-plugin-sql`) for local data · `tauri-plugin-updater` with signed updates.

## Layout
```
app/ (or src/)          frontend SPA — calls invoke('<command>') via a typed wrapper, never fetch() to remote APIs
src-tauri/
  src/main.rs           builder, plugin registration, invoke_handler![…]
  src/commands/<area>.rs  #[tauri::command] async fns — thin; validate input, call services
  src/services/         business logic, API client (reqwest), storage
  src/error.rs          one serializable AppError (thiserror) → frontend
  capabilities/*.json   least-privilege permissions per window
  tauri.conf.json       CSP set, devUrl/frontendDist, bundle + updater config
```

## Rules
- **Security model:** the webview is untrusted. No remote content in the main window. Strict CSP. Capabilities grant only the plugins/commands each window needs — no blanket `fs:default`/`shell:allow-execute`. Every command validates its arguments (paths canonicalized and scoped to app dirs).
- Tokens live in the OS keychain (`keyring`) and are attached in Rust; the frontend never sees them. Remote calls go Rust → Go API.
- Commands are `async`, return `Result<T, AppError>`; long work runs on a task and reports progress via events.
- Type the bridge: one `invoke` wrapper per command in `app/lib/tauri.ts` (or generate with `tauri-specta`), so the frontend and Rust signatures can't drift.
- UI: Nuxt UI / shadcn components; respect platform conventions (menu bar on macOS, window controls, keyboard shortcuts with Cmd/Ctrl), dark mode, ≥ 44px hit targets for primary actions.

## Tests & verify
Rust: unit tests for services, `cargo clippy --all-targets -D warnings`, `cargo test`. Frontend: vitest with the `invoke` wrapper mocked (`@tauri-apps/api/mocks`). E2E (critical flows): WebDriver via `tauri-driver` on Windows/Linux. Verify preset: typecheck · lint · test · clippy · cargo test.

## Deploy
CI builds per OS (`tauri-action`), signs (Windows Authenticode / macOS notarization), publishes the updater manifest. Draft releases the agent may create in CI; publishing a release and touching signing keys is gated. Rollback: re-point the updater manifest to the previous version.

## Scaffold
`pnpm create tauri-app@latest <name>` (Vue or React template) → for Nuxt, replace the Vite frontend with `nuxt` (`ssr: false`, `devServer.port` = `devUrl` port, `frontendDist: ../.output/public`) and add `@nuxt/ui`; React: shadcn init. Add `keyring`, `thiserror`, `serde`, `reqwest` (rustls), `sqlx` (sqlite) as needed; updater plugin + key pair (private key → CI secret, never the repo).

## CLAUDE.md snippet
- Tauri v2: frontend is a SPA that only calls typed invoke wrappers (app/lib/tauri.ts); Rust commands in src-tauri/src/commands are the BFF.
- Tokens in OS keychain; network/fs/secrets only in Rust. Least-privilege capabilities; validate and scope every path.
- Errors: one AppError (thiserror, Serialize). `cargo clippy -D warnings` must pass.
