---
name: setup
description: Bootstrap a new or existing repository for the AI-native SDLC — .sdlc/config.json with verify commands, the docs/sdlc artifact chain, a one-page CLAUDE.md with a verification block, REVIEW.md. Existing projects keep their stack (detected, verify from their own scripts, already-failing checks baselined); new projects choose the default templates or let Claude choose, which apps to build, and the backend (fullstack, new separate Go API, or an existing API behind a BFF). Local-first on the user's Claude subscription; `setup ci` adds optional GitHub automation (PR review, evals, build triage, monitor) with a subscription token or API key. Use when ai-sdlc is not yet initialized, when asked to set up / harden the harness, or for /ai-sdlc:setup [ci].
argument-hint: "[ci]"
---

With argument `ci`: skip to the last section, "Mode: setup ci".

# Setup

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`. Work in this order; each step is useful on its own (the playbook's "starting plays").

## 0. New or existing?
`sdlc inspect` — lists detected apps (folder, framework, matching stack profile or "no profile") and the verify commands built from each app's **own** scripts with its **own** package manager. "no app detected" = new project. This decides §5.

## 1. Core (always)
1. `sdlc init` — writes `.sdlc/config.json` (verify commands from detection; never scripts the project doesn't define), `.sdlc/.gitignore` (`local/`), `docs/sdlc/README.md`. It never touches existing source files.
2. Check `verify` in `.sdlc/config.json`: every entry must exit non-zero on failure and run without prompts. Order: fast → slow (typecheck, lint, build, test). If the project runs checks differently (a root Makefile, `turbo`, `nx`), replace the entries with those commands. New project with no app yet: leave `verify` empty — §5 fills it.
3. Fill the rest of config with the user only where it matters:
   - `protectedPaths`: generated code that exists in this repo (`src/gen/**`, `**/*.g.dart`, `internal/db/sqlc/**`, `api/openapi.gen.ts`), frozen packages, vendored code. Never protect hand-written files.
   - `formatOnEdit`: off unless the user agrees (it rewrites each edited file). File-scoped and fast, e.g. `npx prettier --write {file}`, `gofmt -w {file}`, `dart format {file}`.
   - `prodGate`: `ask` (default — the user approves in the permission prompt) or `deny` (requires `RELEASE_APPROVAL=<ticket>` in the launching shell).
   - Override `prodPatterns` only to add the repo's real deploy commands.

## 2. CLAUDE.md (institutional knowledge)
- If none exists: `sdlc scaffold claude-md`, then fill it from the repo (what `/init` would find): commands, conventions, architecture, and "Things Claude gets wrong" (start empty). Trim to one page.
- If one exists: merge in only the **Workflow** and **Verifying your work** sections from `${CLAUDE_PLUGIN_ROOT}/templates/repo/CLAUDE.md`. Don't rewrite the user's content.
- Commands listed must match `.sdlc/config.json#verify` exactly.

## 3. Review policy
`sdlc scaffold review` → `REVIEW.md`. Add repo specifics to "Do not report" (generated dirs).

## 4. Local-first — no API key needed
Don't ask about CI here. Everything in the loop runs inside the user's own Claude Code session on their subscription:
| Playbook play | Runs locally as |
|---|---|
| AI review before merge | **review** skill → `reviewer` / `ui-reviewer` subagents |
| Babysit PR to green | **ship** skill (reads `gh` checks and comments, fixes, pushes) |
| Failed-build triage | **ship** skill reads `gh run view --log-failed` |
| Agent evals | `node evals/run.mjs` — uses the local `claude` login (offered after a few shipped changes, see below) |
| Close the loop | **triage** skill runs `sdlc detect` on demand |
Tell the user in one line: "Runs on your Claude subscription — no API key. CI automation is optional: `/ai-sdlc:setup ci`."

## 5a. Existing project (`sdlc inspect` found apps) — keep the stack
Don't ask the new-app questions; the code already answered them. One `AskUserQuestion` call:
- **"Is this what's in the repo?"** (header `Detected`) — options: **Yes** / **Not quite** (then ask which folders/frameworks are wrong and fix `verify` by hand). Put the `sdlc inspect` summary in the question text.
- **"Run a formatter on every file Claude edits?"** (header `Formatter`) — **No (Recommended for repos that aren't already formatter-clean)** / **Yes** — explain it may reformat whole files and create noisy diffs.

Then:
1. `sdlc stack --detect` (add `--format` if they said yes). It records the apps in `.sdlc/stack.json` (`mode: existing`), merges the detected verify commands, adds protected generated paths and deploy-gate patterns **only** for apps that match a profile and paths that exist, and adds no other presets. Apps with "no profile" (Laravel, Django, Rails, plain Node…) keep their own conventions — put them in CLAUDE.md.
2. `sdlc baseline` — runs every verify command once. Checks already failing (missing tool, missing script, broken tests) are marked known-red: reported by `sdlc verify` but not enforced, so the Stop gate never makes Claude fix a red build it didn't cause. Show the user the red list and offer a tier-S change to make each one green (then `sdlc baseline` again enforces it).
3. Stack profiles' references (`${CLAUDE_PLUGIN_ROOT}/skills/stack/references/`) are guidance for **new** code in matching apps — never a reason to restructure existing code. Restructuring is its own tier-L change with an ADR.
4. CLAUDE.md "Stack" section: describe what's there (from inspect), not the profile.

## 5b. New project (no app detected) — what are we building?
**First call** — one `AskUserQuestion` with two questions:
1. **"How should the stack be chosen?"** — header `Stack`, single select:
   - **Use the default templates** — the team's standard stack: Vue + Nuxt UI on web and desktop (Nuxt on the web, Vite + Vue in the desktop app), Flutter on mobile, Go + Postgres for a separate backend.
   - **Let Claude choose** — Claude picks what it's most confident building and verifying for this app: React + shadcn/ui on web and desktop (Hono API at the edge for simple apps), Expo on mobile, Go + Postgres for a separate backend.
2. **"Which apps are you building?"** — header `Surfaces`, `multiSelect: true`: **Web** (browser SPA) · **Mobile** (iOS + Android) · **Desktop** (Windows/macOS/Linux, Tauri v2).

**Backend:**
- **Default templates →** a second `AskUserQuestion`, **"Where does the data live?"** (header `Backend`):
  - **Fullstack (one app)** — the Cloudflare app (Workers + D1/KV/R2) is the web app and the API. CRUD, internal tools, content, dashboards; one team. Mobile/desktop call its `/api`; desktop-only = local-first Tauri (Rust + SQLite).
  - **New separate backend** — a Go API (OpenAPI contract-first, Postgres, hosted on AWS/GCP/DO/any VPS) owns accounts and sessions for every client; the web SPA reaches it through a passthrough Worker on its own origin (no BFF). Several clients, transactional domains, jobs, heavy reporting, separate frontend team.
  - **Existing API** — an API the team doesn't control. The web app gets a BFF (Nuxt server) that keeps the API's tokens or keys server-side; mobile/desktop call the API directly.
  Mark one "(Recommended)": existing if the user mentioned an API they consume; separate backend when web is combined with mobile/desktop, or for payments/multi-tenant/integrations/jobs; fullstack otherwise.
- **Let Claude choose →** don't ask; decide the backend yourself with the same rules (ask one short question only if you don't know whether an existing API is involved), and say the choice in one line with its reason.

Then run `sdlc stack --choice <default|claude> --surfaces <comma list> --backend <fullstack|separated|existing>`. It maps the answers to components and records them in `.sdlc/stack.json`:
| Backend | default | claude |
|---|---|---|
| fullstack | `edge-web` (Nuxt) | `edge-web` (React + Hono) |
| separated | `spa-web` (Nuxt SPA + passthrough Worker) + `go-api` | `spa-web` (React SPA + passthrough Worker) + `go-api` |
| existing | `bff-web` (Nuxt BFF) | `bff-web` (Next BFF) |
| + mobile / + desktop | `flutter` / `tauri` (Vue) | `expo` / `tauri` (React) |
`--ui vue|react` overrides the web/desktop UI for the default choice when the user asks for it. Then continue with the **stack** skill from "§2 Record" step 1 (ADR — for "Let Claude choose", the ADR records Claude's reasons) and step 3 (CLAUDE.md "Stack" section).

Then offer to scaffold: "Want me to create the app now from the ai-sdlc templates?" On yes: `sdlc scaffold-app --name <app-name>` (see the **stack** skill §3). It's a fixed, verified template, so it doesn't need the intent→plan chain; it must end with verify green. Then suggest committing, and `/ai-sdlc:vibe` for the first feature.

## 6. Finish
- Recommend branch protection on main: PR required, code-owner approval, required checks = the verify commands. Agents never push to main (the prod gate also asks on `git push … main`).
- Show what was created, the known-red checks (if any), and what still needs a human (secrets, branch protection). Suggest committing as `chore: adopt ai-sdlc`.
- Note in one line: the plugin's secrets guard and production-deploy prompt are active in every session where the plugin is enabled, set up or not; the plan gate, verify gate and formatter only act in repos set up like this one.

## Mode: `/ai-sdlc:setup ci` (only when asked)
CI automation runs Claude without a person present, so it needs a credential stored as a GitHub secret. Ask which one with AskUserQuestion:
- **Subscription token (Recommended)** — the user runs `claude setup-token` locally (Pro/Max), then `gh secret set CLAUDE_CODE_OAUTH_TOKEN` and pastes it. CI usage counts against that person's plan limits; use a team member's token they're comfortable sharing with the repo's workflows.
- **API key** — `gh secret set ANTHROPIC_API_KEY` (pay-as-you-go). In each scaffolded workflow, swap the commented auth line.
Never ask the user to paste the token into this session — they set the secret themselves (suggest `! gh secret set CLAUDE_CODE_OAUTH_TOKEN`).
Then offer, as one multi-select: Claude PR review + `@claude` (`sdlc scaffold ci-review`; needs branch protection with code-owner approval), agent evals in CI (`sdlc scaffold evals ci-evals`), failed-build triage (`sdlc scaffold ci-triage`; set `workflows:` to the CI workflow's name), close-the-loop monitor (`sdlc scaffold ci-monitor`; needs a deployed app and a metric with history), managed-settings reference (regulated orgs). Mention cost: each run consumes plan usage or API spend; the monitor only invokes Claude on a 2σ+ breach.
