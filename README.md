# ai-sdlc — vibe coding on the AI-native SDLC

A Claude Code plugin for **developers** that turns [The AI-Native SDLC Playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook) into a working loop. You talk about what you want; Claude carries it through **intent → spec → plan → build/verify → review → ship**. Each stage commits an artifact that the next stage reads. Humans approve at the judgment points, and deterministic hooks enforce the rest.

> Code is no longer the bottleneck. Keep the speed of vibe coding, and add an audit trail, guardrails and a feedback loop.

## Install

```text
/plugin marketplace add tammai/ai-sdlc
/plugin install ai-sdlc@ai-sdlc
```
When the install dialog asks for a scope, pick **project** (this repo only) to try it out; **user** scope turns the plugin on in every repo you open.

Requires Node ≥ 18 (hooks and CLI have zero dependencies) and git; `gh` for PR flows. **Works on a Claude subscription — no API key.** Review, babysitting, triage and evals run in your own session; GitHub automation is opt-in via `/ai-sdlc:setup ci` using a `claude setup-token` subscription token (or an API key).

## Quick start

```text
/ai-sdlc:setup                     # once per repo: config, CLAUDE.md, REVIEW.md
                                   # new repo: asks web / mobile / desktop, fullstack or separated backend
                                   # existing repo: keeps its stack, baselines checks that already fail
/ai-sdlc:vibe add a claims status page for customers
/ai-sdlc:fix login fails when email has a plus sign
/ai-sdlc:status
```

## The loop

| Stage | Skill | Artifact | Human judgment | Enforced by |
|---|---|---|---|---|
| Plan | `intent` | `intent.md` (problem, outcome, systems, constraints, tier) | approve intent | — |
| Design | `system-design`, `architecture`, `uiux`, `stack` → `spec` | `design.md` + ADRs (tier L), `ui.md` + `DESIGN.md` (UI work), then `spec.md` with policies applied while writing | approve design / UI direction / spec | CLI refuses spec approval until required design artifacts are approved |
| Build | `plan` → `build` | `plan.md`, then code from a tier-routed implementer | approve plan | **plan gate** hook: no code edits until plan.md is approved |
| Test | `build`, `fix` | `verify.md` toolchain evidence | — | **Stop** hook: can't finish with unverified edits; **test lock** during fixes |
| Deploy | `review` → `ship` | `review.md`, PR with the chain | approve review; code owner merges; release manager deploys | **prod gate** (ask/deny), secrets guard, never push to main |
| Maintain | `triage` | a new `intent.md` (`source: monitor/incident/scan`) + eval | service owner triages | deterministic `sdlc detect` bands |

Design skills: `system-design` (capacity math against real stack limits, failure modes, adversarial `architect-reviewer`), `architecture` (ADR log in `docs/sdlc/adr/`), `uiux` (discovery interview, DESIGN.md contract, 2–3 directions, numeric craft rules, anti-slop list, capped polish loop, evidence-gated `ui-reviewer`).

Supporting skills: `learn` (if Claude makes the same mistake twice, the fix goes into CLAUDE.md), `policy` (encodes a standard as a skill plus a backstop), `status` (the chain plus playbook metrics).

### Risk tiers keep it light
- **S** (≤3 files, reversible): intent → plan → build → PR. No spec, no review.md.
- **M** (normal feature): the full chain.
- **L** (auth, payments, PII, migrations, breaking API, new stack): the full chain, tech-lead approvals, deep review, and an ADR.

### Model routing for subagents
| Complexity | When | Model / effort | Agents |
|---|---|---|---|
| simple | tier S | Sonnet / low | `implementer-simple`, `researcher-simple` |
| normal | tier M | Sonnet / high | `implementer`, `reviewer`, `researcher`, `verifier`, `architect-reviewer`, `ui-reviewer` |
| complex | tier L, or a risky step (`--complexity complex`) | Opus / medium | `implementer-complex`, `reviewer-complex`, `researcher-complex`, `architect-reviewer-complex`, `ui-reviewer-complex` |

`sdlc route [role]` resolves the agent for the active change. Each role has one source definition in `agents-src/`. After editing one, regenerate the tier variants with `node scripts/build-agents.mjs`.

## Opinionated stacks (`/ai-sdlc:stack`)
| Need | Stack |
|---|---|
| Simple web app | **Nuxt 4** full-stack on **Cloudflare Workers** (D1 + KV + R2, Drizzle), Nuxt UI, Tailwind v4, `ssr:false`. React variant: Next + shadcn/ui via OpenNext |
| Complex web app | **Nuxt/Next BFF** (SPA, cookie sessions) → **Go API** (OpenAPI contract-first, oapi-codegen + chi, sqlc + pgx, goose) → **Postgres** in Docker |
| Mobile | **Flutter** (Riverpod, go_router, Dio + generated client) over the Go API |
| Desktop | **Tauri v2** with a Nuxt UI (or React + shadcn/ui) SPA; Rust commands as the BFF |

Setup asks two questions — **which surfaces** (web, mobile, desktop) and **fullstack vs separated backend** — and `sdlc stack --surfaces web,mobile --backend fullstack|separated` maps them to components:

| Backend | Web | + Mobile | + Desktop |
|---|---|---|---|
| fullstack | `edge-web` | `flutter` → edge-web `/api` | `tauri` (desktop-only: local-first Rust + SQLite) |
| separated | `bff-web` + `go-api` | `flutter` + `go-api` | `tauri` + `go-api` |

`sdlc stack` records the decision in `.sdlc/stack.json` and merges each component's verify commands, protected generated paths, formatters and production-gate patterns into `.sdlc/config.json`.

## App templates (`sdlc scaffold-app`)
For a new app, setup offers to create it from full, working templates in `templates/apps/`. Each template is generated with the framework's official tooling, pinned with a lockfile, and ships one working **notes** feature (list and create, validation, empty, loading and error states, tests) to copy for real features.

| Template | What you get |
|---|---|
| `edge-web-nuxt` / `edge-web-next` | Nuxt 4 + Nuxt UI, or Next 16 + shadcn/ui (OpenNext), SPA on Cloudflare Workers, with D1 via Drizzle, KV and R2 bindings, and tests on a local D1 |
| `bff-web-nuxt` / `bff-web-next` | Nuxt/Next BFF holding a cookie session, CSRF check, and a typed client generated from `contracts/openapi.yaml` |
| `go-api` | chi + oapi-codegen strict server, sqlc + pgx, goose, JWT/JWKS middleware, problem+json errors, Dockerfile, compose with Postgres; tools run as `go tool` |
| `tauri-nuxt` / `tauri-react` | Tauri v2 with Rust commands as the BFF, local SQLite, least-privilege capabilities, strict CSP, typed `invoke` wrapper |
| `flutter` | Material 3, Riverpod, go_router, Dio with an auth interceptor, notes feature against the shared contract |

`sdlc scaffold-app` copies the templates for the components in `.sdlc/stack.json`, fills in the app name, installs, writes the verify commands, adds stack notes to CLAUDE.md, and runs verify. `.github/workflows/templates.yml` scaffolds and verifies every template weekly on Linux. It needs no Claude token.

Known limits:
- **edge-web-next** builds on Linux, macOS or WSL. OpenNext needs symlinks, so on Windows without Developer Mode, run `pnpm build` in WSL.
- **flutter** was written without a local Flutter SDK. Its only proof is the CI run, and its lockfile is created on first install.

## Guardrails (hooks)
| Hook | What it does |
|---|---|
| PreToolUse `guard.mjs` | Blocks reads/writes of secret files and secret-looking strings; protected/generated paths; locked tests; code edits before plan approval; production commands (deploy to prod, `wrangler deploy`, `terraform apply`, push to main/force-push, store releases…) are `ask` (or `deny` unless `RELEASE_APPROVAL` is set) |
| PostToolUse `post-edit.mjs` | Runs the file-scoped formatter; marks the change as having unverified edits |
| Stop `stop-gate.mjs` | Sends Claude back once to run `sdlc verify` before it reports done |
| SessionStart | Re-hydrates the active change and its next step |

**What's active where:**
- **Every session where the plugin is enabled**, set up or not: the secrets guard (blocks `.env`, keys, credentials) and the production-deploy prompt.
- **Only in repos set up with `/ai-sdlc:setup`** (they have `.sdlc/config.json`): the verify gate, the formatter (if you turned it on) and the session-start summary.
- **Only while a change is active:** the plan gate (`sdlc deactivate` turns it off for out-of-band edits).

## Existing projects
Setup detects what's already there (`sdlc inspect`) and keeps it. It doesn't ask the new-app questions or restructure anything.
- **Verify commands** come from the project's own scripts (package.json, Makefile, go.mod, pubspec.yaml, pyproject.toml…), run with its own package manager (npm, pnpm, yarn or bun). It never adds a script the project doesn't define.
- **Stack profiles** only add protected generated paths that actually exist and deploy-gate patterns. Apps with no matching profile (Laravel, Django, Rails…) keep their own conventions.
- **The formatter** is off unless you agree.
- **`sdlc baseline`** marks checks that already fail as *known-red*. `sdlc verify` reports them but doesn't enforce them, so Claude is never pushed to fix a red build it didn't cause. Fix them as small changes and re-run `sdlc baseline` to start enforcing them.

## CLI
`node scripts/sdlc.mjs help`: `init · inspect · baseline · scaffold-app · scaffold · adr · stack · route · new · draft · approve · reject · reopen · status · activate · deactivate · verify · lock-tests · unlock-tests · close · metrics · detect`.

## Scaffolds (`sdlc scaffold …`)
`claude-md`, `review` (REVIEW.md), `evals` (worktree-isolated agent eval runner), `ci-evals`, `ci-review` (claude-code-action review + `@claude`), `ci-triage` (failed-build triage), `ci-monitor` (detect → diagnose → intent PR), `babysit-command`, `design-md` (DESIGN.md contract), `managed-settings` (regulated-org reference).

## What stays human
Approving intent and spec (product owner), approving the plan (engineer or tech lead), merging the PR (code owner), deploying to production (release manager), and triaging maintenance findings (service owner). Agents generate and verify. They never approve their own work and never cross the production gate.

## License

MIT — see [LICENSE](LICENSE).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
