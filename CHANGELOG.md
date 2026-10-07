# Changelog

All notable changes to the ai-sdlc plugin. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).
After updating, run `/plugin marketplace update ai-sdlc` then `/plugin update ai-sdlc@ai-sdlc`.

## [Unreleased]

### Changed
- **"Let Claude choose" is the first and default stack option** in setup. The team's stack is now the "From templates" option (`--choice templates`; `team` and `default` still work as aliases). `sdlc stack` without `--choice` uses Claude's picks.
- **Setup always asks whether the app uses an existing backend API**, on both paths. Before, the "Let Claude choose" path assumed there was none. The answers are:
  - no (build the backend);
  - our own API we can change (new `--backend existing-own`: SPA + passthrough Worker pointed at it, no BFF, no new Go API);
  - an API we don't control (`--backend existing`: BFF).
- **`--api-url`** is recorded in `.sdlc/stack.json` and used by `scaffold-app` for the contract server, the SPA dev proxy and the Worker's local `ORIGIN_URL`.

### Fixed
- **Setup's stack table** had its "claude" and "team" columns swapped.

## [0.4.0] — 2026-10-07

Stack choice, real auth in the Go API, and no BFF in front of your own API.

### Added
- **Setup asks how to choose the stack:** "Use the default templates" or "Let Claude choose". `sdlc stack --choice default|claude`.
- **Backend option for an existing API.** `--backend existing` maps the web app to `bff-web`, a BFF that keeps that API's tokens or keys server-side.
- **New templates:**
  - `spa-web-nuxt` / `spa-web-react`: a static SPA plus a passthrough Cloudflare Worker that forwards `/api/*` to the Go API, with no logic. Includes sign-in screens driven by `/v1/auth/providers`, a route guard, and OIDC error handling.
  - `edge-web-hono-react`: Vite + React SPA with a Hono API and D1 in one Worker, typed end to end with Hono RPC.
  - `expo`: Expo SDK 57 mobile client.
    - Sign-in methods: password, magic-link deep links, and OIDC with PKCE.
    - Tokens: single-flight refresh with rotation, stored in SecureStore.
    - Also: a sign-up screen.
  - `tauri-vue`: Vite + Vue desktop with file-based routing (Vue Router 5), for desktop-only apps.
- **Shared Nuxt layer.** When a Nuxt web app and a Nuxt desktop app are created together (or desktop is added to an existing Nuxt web app), `scaffold-app` creates `packages/ui-layer` and has the new apps extend it. It never edits an existing app; it prints the one-line `extends` change.
- **Real auth in the `go-api` template**:
  - **Sessions and tokens:** web gets an httpOnly session cookie with CSRF checks (`X-Requested-With` + Origin allow-list). Native gets opaque bearer tokens with refresh rotation, reuse detection and a 90-day absolute cap.
  - **Sign-in methods:**
    - password (argon2id, rehash on login, no account enumeration);
    - optional magic link (log or SMTP);
    - OIDC providers (authorization code + PKCE, state, nonce, browser binding, verified-email linking only).
  - **Native OIDC uses app-side PKCE** (RFC 8252). Production refuses to start with insecure settings.
  - **Notes are scoped per user.** Rate limits send `Retry-After`. Audit log lines never contain tokens.
- **Shared contract v0.3.0** describes the full auth API.
- **New stack profiles and references:** `spa-web` / `web-spa-go.md` and `expo` / `mobile-expo.md`.
- **CI:** 13 template jobs plus a combination job (Nuxt web + Nuxt desktop with the shared layer).

### Changed
- **New separate backend:** now `spa-web` + `go-api` (the Go API owns sessions). It was `bff-web` + `go-api`. A full BFF in front of your own API needs an ADR.
- **Desktop template choice:**
  - `tauri-nuxt` when there's also a Nuxt web app;
  - `tauri-vue` when desktop is the only app;
  - `tauri-react` on Claude's choice.
- **`scaffold-app`:**
  - chooses the UI per component from `.sdlc/stack.json`;
  - adds explicitly named new components to existing projects (into empty folders only);
  - fills placeholders in template commands.
- **Nuxt 4.6 templates require Node ≥ 22.21** (`engines` and `template.json`).
- **The `go-api` test command** is `go test -v ./...`, so CI shows which tests ran or skipped.

### Fixed
- **tauri-vue:** `build.rs` created Nuxt's `.output/public` instead of `dist`. Verify now regenerates typed routes before typecheck.
- **expo:** a test hard-coded the scheme `demo-notes://` instead of the app-name placeholder.
- **Contract:** an unquoted comma split the 202 description in `/v1/auth/magic-link`. Grant fields are documented as camelCase. Native sign-up and OIDC error codes (web and native) are documented.

## [0.3.0] — 2026-10-07

Full app templates for new projects.

### Added
- **`sdlc scaffold-app`.** Creates the app from full templates for the stack recorded in `.sdlc/stack.json`. It:
  - fills in the app name, title, Go module and API URL;
  - copies the shared `contracts/openapi.yaml` and `docker-compose.yml` to the repo root;
  - installs from pinned lockfiles;
  - writes the verify commands;
  - adds each template's notes to the CLAUDE.md "Stack" section (creating CLAUDE.md if missing);
  - runs verify.

  It refuses folders that aren't empty and repos with an existing app.
- **8 templates in `templates/apps/`:** edge-web-nuxt, edge-web-next, bff-web-nuxt, bff-web-next, go-api, tauri-nuxt, tauri-react, flutter. Each ships a working notes feature with tests. The contract is in `templates/apps/SPEC.md`.
- **`.github/workflows/templates.yml`.** Scaffolds and verifies every template weekly and on changes (Linux runners, Postgres service for go-api). It needs no Claude token.

### Changed
- **Setup offers `scaffold-app`** after recording a new stack. The stack references now point to the templates.

### Known limits
- **edge-web-next** `pnpm build` needs symlink support (Linux, macOS, WSL, or Windows Developer Mode).
- **flutter** was written without a local Flutter SDK. CI proves it: `flutter analyze` is clean and all 17 tests pass. Its lockfile is generated on first install.
- **go-api** tests don't use `-race`, which needs cgo. The drift check regenerates and builds rather than diffing against git.

## [0.2.1] — 2026-10-06

Installing on an existing project now keeps its stack.

### Added
- **`sdlc inspect`.** Detects existing apps per folder (Nuxt, Next, Go, Flutter, Tauri, Node, Python, PHP, Ruby, JVM, Rust) and whether each matches a stack profile.
- **`sdlc stack --detect [--format]`.** Records the existing stack instead of choosing a new one, and adds only the presets that fit:
  - protected generated paths, only where those folders exist;
  - production-gate patterns for apps that match a profile;
  - the per-file formatter, only with `--format` and only when the project already uses eslint.
- **`sdlc baseline`.** Runs every verify command once and marks checks that already fail as *known-red*. `sdlc verify` reports known-red checks but doesn't enforce them, so the Stop gate never makes Claude fix a build that was already broken. Re-run it after fixing a check to start enforcing it.

### Changed
- **Verify commands come from the project itself.** `sdlc init` builds them from the project's own scripts with its own package manager (npm, pnpm, yarn, bun), per app folder in monorepos. It never adds scripts that don't exist.
- **Setup handles existing projects.** It runs `inspect` first. For an existing project it confirms what was detected, asks whether to turn the formatter on, then runs `stack --detect` and `baseline`. It no longer asks the new-app questions there.
- **`sdlc stack --surfaces/--components` refuses on a repo that already contains an app**, unless you pass `--force`.

### Fixed
- **README:** it said the hooks only apply after setup. The secrets guard and the production-deploy prompt are active in every session where the plugin is enabled; the README now says so and recommends project-scope installs for trying the plugin out.
- **Stack presets on existing projects** no longer add commands for missing scripts or use the wrong package manager (e.g. `pnpm run typecheck` in an npm project).

## [0.2.0] — 2026-10-06

### Added
- **Setup asks what you're building.** At the end of `/ai-sdlc:setup`, one question picks the apps (web, mobile, desktop) and another picks fullstack or a separated backend.
- **`sdlc stack --surfaces web,mobile,desktop --backend fullstack|separated`.** Maps those answers to stack components the same way every time:
  - **fullstack** → `edge-web`, plus `flutter` and/or `tauri`
  - **separated** → `go-api` with `bff-web`, plus `flutter` and/or `tauri`
  - **desktop only + fullstack** → a local-first Tauri app with no server

  The answers are recorded in `.sdlc/stack.json`.
- **`/ai-sdlc:setup ci`.** Optional GitHub automation: Claude PR review with `@claude` fixes, agent evals, failed-build triage, and the close-the-loop monitor.
  - Authenticates with a subscription token from `claude setup-token`, stored as the `CLAUDE_CODE_OAUTH_TOKEN` secret.
  - An API key works as an alternative.

### Changed
- **Works on a Claude subscription by default — no API key needed.** Setup no longer offers CI options. Review, PR babysitting, build triage, evals and anomaly triage run inside your own Claude Code session.
- **CI workflow templates use the subscription token by default.** Each template keeps a commented `ANTHROPIC_API_KEY` line for API-key users.
- **`sdlc stack` won't overwrite a decided stack.** Changing it needs `--force`, after an approved tier-L change and an ADR.
- **Monorepo folder.** The `edge-web` component defaults to `web/` when it's combined with other apps. It still sits at the repo root when it's the only app.
- **Clearer CLAUDE.md wording** in the Cloudflare stack about which commands need a human: remote D1 migrations, Worker secrets and production deploys.

### Fixed
- **Secrets guard false positive.** Writing text that mentions a secret-like path (e.g. "D1/secrets/deploy") through a shell heredoc is no longer blocked. The guard now:
  - ignores heredoc bodies, PowerShell here-strings and commit messages;
  - blocks folder-style patterns (`secrets/**`, `.ssh/**`) only when the path exists;
  - still blocks distinctive secret files (`.env`, `*.pem`, `id_rsa`) wherever they appear.

## [0.1.0] — 2026-10-06

### Added
- **Built from [The AI-Native SDLC Playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook).** Each stage commits an artifact the next stage reads: intent → (system design / UI design) → spec → plan → build/verify → review → ship → maintain.
- **Skills:**
  - main loop: `vibe`, `setup`, `intent`, `spec`, `plan`, `build`, `fix`, `review`, `ship`
  - design: `system-design`, `architecture`, `uiux`, `stack`
  - ongoing: `triage`, `learn`, `policy`, `status`
- **Hooks:**
  - plan gate: no code edits until `plan.md` is approved
  - test lock during fixes
  - secrets guard and protected generated paths
  - production gate: asks, or denies unless `RELEASE_APPROVAL` is set
  - file formatter on edit
  - verify-before-done Stop gate
  - session resume
- **Subagents routed by risk tier.** One source per role in `agents-src/`, generated into one file per tier:
  - simple → Sonnet / low
  - normal → Sonnet / high
  - complex → Opus / medium

  Roles: implementer, reviewer, researcher, verifier, architect-reviewer, ui-reviewer.
- **`sdlc` CLI:** chain state and approvals, ADR log, stack presets, verify evidence (`verify.md`), playbook metrics, Western Electric anomaly detection (`detect`), model routing (`route`).
- **Stack profiles:**
  - Nuxt/Next on Cloudflare (D1/KV/R2)
  - Nuxt/Next BFF + Go (oapi-codegen, sqlc, goose) + Postgres in Docker
  - Flutter
  - Tauri v2
- **Scaffolds:** `CLAUDE.md`, `REVIEW.md`, `DESIGN.md`, agent eval runner, CI workflows, `/babysit` command, managed-settings reference.
- MIT license.

[0.4.0]: https://github.com/tammai/ai-sdlc/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/tammai/ai-sdlc/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/tammai/ai-sdlc/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/tammai/ai-sdlc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tammai/ai-sdlc/releases/tag/v0.1.0
