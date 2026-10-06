# Changelog

All notable changes to the ai-sdlc plugin. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).
After updating, run `/plugin marketplace update ai-sdlc` then `/plugin update ai-sdlc@ai-sdlc`.

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

[0.2.0]: https://github.com/tammai/ai-sdlc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tammai/ai-sdlc/releases/tag/v0.1.0
