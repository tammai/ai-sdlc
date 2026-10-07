# ai-sdlc — vibe coding on the AI-native SDLC

A Claude Code plugin for **developers** that turns [The AI-Native SDLC Playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook) into a working loop. You talk about what you want; Claude carries it through **intent → spec → plan → build/verify → review → ship**. Each stage commits an artifact that the next stage reads. Humans approve at the judgment points, and deterministic hooks enforce the rest.

> Code is no longer the bottleneck. Keep the speed of vibe coding, and add an audit trail, guardrails and a feedback loop.

## Install

```text
/plugin marketplace add tammai/ai-sdlc
/plugin install ai-sdlc@ai-sdlc
```
When the install dialog asks for a scope, pick **project** (this repo only) to try it out; **user** scope turns the plugin on in every repo you open.

Requires Node ≥ 18 for the plugin itself (hooks and CLI have zero dependencies; the app templates need Node ≥ 22, see [Known limits](#app-templates-sdlc-scaffold-app)) and git; `gh` for PR flows. **Works on a Claude subscription — no API key.** Review, babysitting, triage and evals run in your own session; GitHub automation is opt-in via `/ai-sdlc:setup ci` using a `claude setup-token` subscription token (or an API key).

## Quick start

```text
/ai-sdlc:setup                     # once per repo: config, CLAUDE.md, REVIEW.md
                                   # new repo: let Claude choose (default) or from templates; web / mobile / desktop; backend
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

For tier L, `sdlc route reviewer` overrides the table: the reviewer runs on a model different from the implementer's (see [Gates](#gates-and-how-strictly-they-apply)), which with the default ladder means `reviewer` (Sonnet / high).

`sdlc route [role]` resolves the agent for the active change. Each role has one source definition in `agents-src/`. After editing one, regenerate the tier variants with `node scripts/build-agents.mjs`.

## Stacks (`/ai-sdlc:stack`)
For a new app, setup asks three questions, plus a fourth when there is no backend yet:
1. **Stack:** **let Claude choose** what it's most confident building and verifying (the default), or build **from templates** (the team's stack).
2. **Apps:** web, mobile and/or desktop.
3. **Existing API?** No (build the backend too) · yes, our own API we can change · yes, an API we don't control. Always asked.
4. **Backend** (only when nothing exists): building from templates asks fullstack vs a separate Go API. When Claude chooses, it asks what the backend needs (payments/multi-tenant, jobs/integrations/reporting, scale/separate team, or a simple app) and decides from that.

| Backend | From templates | Claude's choice (default) |
|---|---|---|
| **Fullstack**: the edge app is the backend | `edge-web-nuxt`: Nuxt 4 on Cloudflare Workers (D1/KV/R2, Drizzle) | `edge-web-hono-react`: Vite + React SPA and a Hono API in one Worker |
| **New separate backend**: a Go API owns accounts and sessions for every client | `spa-web-nuxt` (Nuxt `ssr:false` + passthrough Worker) + `go-api` | `spa-web-react` (Vite + React + passthrough Worker) + `go-api` |
| **Your own existing API** (you can change it) | `spa-web-nuxt` + passthrough Worker → your API (`--api-url`) | `spa-web-react` + passthrough Worker → your API |
| **Existing API** you don't control | `bff-web-nuxt`: the BFF keeps that API's tokens/keys server-side | `bff-web-next` |
| + Mobile | `flutter` | `expo` |
| + Desktop | `tauri-nuxt` next to a Nuxt web app (shares `packages/ui-layer`); `tauri-vue` when desktop is the only app | `tauri-react` |

How the pieces fit:
- **No BFF in front of your own API.** The Go API sets an httpOnly session cookie for the web (with CSRF protection) and issues bearer tokens to mobile and desktop.
  - Sign-in methods: password, optional magic link, and OIDC providers. Native apps use PKCE.
  - The SPA reaches the API on its own origin through a Cloudflare Worker that only forwards `/api/*`.
  - The API runs on AWS, GCP, DigitalOcean or any VPS. A full BFF in front of your own API needs an ADR.
- **One UI framework per choice.** From templates it is Nuxt on the web (file routing, layouts, middleware, SSR off). Letting Claude choose gives Vite + React on the web and Tauri + React on desktop.
- **Desktop matches the web app (from templates).** When there's also a Nuxt web app, desktop is Nuxt and both extend a shared layer (theme, components, composables). Desktop on its own is Vite + Vue with file-based routing.
- **Override the UI framework** with `--ui vue|react|react-hono` on `sdlc stack`. `--ui react` on a fullstack app uses `edge-web-next` (Next.js on Cloudflare via OpenNext) in place of the Nuxt or Hono edge app.

`sdlc stack --choice … --surfaces … --backend …` records the decision in `.sdlc/stack.json`. It also merges each component's verify commands, protected generated paths, formatters and production-gate patterns into `.sdlc/config.json`.

## App templates (`sdlc scaffold-app`)
Setup offers to create the app from full, working templates in `templates/apps/`. Each template:
- is generated with the framework's official tooling;
- is pinned with a lockfile;
- ships one working **notes** feature (list and create, validation, empty, loading and error states, tests) to copy for real features.

| Template | What you get |
|---|---|
| `edge-web-nuxt` / `edge-web-next` / `edge-web-hono-react` | SPA + API on one Cloudflare Worker: D1 via Drizzle, KV and R2 bindings, tests on a local D1 |
| `spa-web-nuxt` / `spa-web-react` | Static SPA + a passthrough Worker (`/api/*` → Go API); sign-in screens driven by `/v1/auth/providers`; route guard; typed client from the contract |
| `go-api` | chi + oapi-codegen strict server, sqlc + pgx, goose, Postgres in Docker; auth with cookie sessions + bearer tokens, password (argon2id), magic link, OIDC with PKCE, refresh rotation with reuse detection, CSRF, rate limits; notes scoped per user |
| `bff-web-nuxt` / `bff-web-next` | BFF for an existing API: server-held session, CSRF check, typed client |
| `flutter` / `expo` | Mobile client of the Go API: bearer tokens in secure storage, notes screens (Expo also: single-flight refresh, OIDC with PKCE, magic-link deep links) |
| `tauri-nuxt` / `tauri-vue` / `tauri-react` | Tauri v2 with Rust commands as the BFF, local SQLite, least-privilege capabilities, strict CSP, typed `invoke` wrapper |

`sdlc scaffold-app` copies the templates for the components in `.sdlc/stack.json`, then:
- fills in the app name;
- copies the shared `contracts/openapi.yaml`, `docker-compose.yml` and the Nuxt layer;
- installs, writes the verify commands, and adds stack notes to CLAUDE.md;
- runs verify.

On existing projects it only adds new components into empty folders. `.github/workflows/templates.yml` scaffolds and verifies every template and a web + desktop combination weekly on Linux. It needs no Claude token.

Known limits:
- **Nuxt 4.6 templates need Node ≥ 22.21.** On older Node 22, `nuxt generate` fails.
- **Windows paths:** keep project paths short on Windows. Cloudflare's local runtime (workerd) and Expo's Hermes compiler fail beyond the 260-character path limit. WSL also works.
- **edge-web-next** builds on Linux, macOS or WSL. OpenNext needs symlinks, so on Windows without Developer Mode, run `pnpm build` in WSL.
- **flutter** was written without a local Flutter SDK; CI proves it on Linux. Its lockfile is created on first install.
- **The BFF templates' login** is a dev stub; replace it with your API's real auth.
- **go-api:** tests don't use `-race` (needs cgo). Rate limits are per instance; add edge rate limiting. There are no email-verification or password-reset endpoints yet.

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

## Gates and how strictly they apply
Two checks sit on the approval commands, next to the hooks. Each has a level, so a team can start gentle and tighten:

| Level | Behaviour |
|---|---|
| `off` | skipped |
| `advisory` | the finding is printed; approval goes through |
| `soft` (default) | approval is refused unless the human accepts the risk with `--override "<reason>"`; the reason is written into the artifact |
| `hard` | approval is refused, no override |

- **Definition of ready (`ready`).** `sdlc approve spec` (and `approve plan` for tier S) waits until every open question in `intent.md` and every Concern in `spec.md` is ticked: `- [ ] question — owner: PO` → `- [x] question → decision (by PO)`. Intent itself can still be approved with questions open. `sdlc ready` lists what is left; `sdlc status` shows `open:N`.
- **Reviewer independence (`independence`).** For tier L (`crossModelReview.tiers`), the reviewer must run on a different model than the implementer. `sdlc route` records which model was routed as implementer, picks the reviewer from `crossModelReview.ladder` (default `["opus","sonnet"]`: an opus implementer gets a sonnet reviewer), and stamps `implemented_by`, `reviewed_by` and `independence` into `review.md`. `approve review` refuses unless it says `cross-model`. Put a stronger model first in the ladder if you have one. If the main session implemented, pass `--implementer-model <m>`.

`sdlc gates` shows the levels; `sdlc gates set ready advisory` changes one. The plan gate and verify-on-stop hooks are unchanged (always hard when on).

## Existing projects
Setup detects what's already there (`sdlc inspect`) and keeps it. It doesn't ask the new-app questions or restructure anything.
- **Verify commands** come from the project's own scripts (package.json, Makefile, go.mod, pubspec.yaml, pyproject.toml…), run with its own package manager (npm, pnpm, yarn or bun). It never adds a script the project doesn't define.
- **Stack profiles** only add protected generated paths that actually exist and deploy-gate patterns. Apps with no matching profile (Laravel, Django, Rails…) keep their own conventions.
- **The formatter** is off unless you agree.
- **`sdlc baseline`** marks checks that already fail as *known-red*. `sdlc verify` reports them but doesn't enforce them, so Claude is never pushed to fix a red build it didn't cause. Fix them as small changes and re-run `sdlc baseline` to start enforcing them.

## CLI
`node scripts/sdlc.mjs help`: `init · inspect · baseline · scaffold-app · scaffold · adr · stack · route · gates · ready · new · draft · approve · reject · reopen · status · activate · deactivate · verify · lock-tests · unlock-tests · close · metrics · detect`.

## Scaffolds (`sdlc scaffold …`)
`claude-md`, `review` (REVIEW.md), `evals` (worktree-isolated agent eval runner), `ci-evals`, `ci-review` (claude-code-action review + `@claude`), `ci-triage` (failed-build triage), `ci-monitor` (detect → diagnose → intent PR), `babysit-command`, `design-md` (DESIGN.md contract), `managed-settings` (regulated-org reference).

## What stays human
Approving intent and spec (product owner), approving the plan (engineer or tech lead), merging the PR (code owner), deploying to production (release manager), and triaging maintenance findings (service owner). Agents generate and verify. They never approve their own work and never cross the production gate.

## License

MIT — see [LICENSE](LICENSE).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
