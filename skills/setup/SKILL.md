---
name: setup
description: Bootstrap a new or existing repository for the AI-native SDLC — .sdlc/config.json with verify commands, the docs/sdlc artifact chain, a one-page CLAUDE.md with a verification block, REVIEW.md. Existing projects keep their stack (detected, verify from their own scripts, already-failing checks baselined); new projects are asked what's being built (web/mobile/desktop, fullstack or separated backend). Local-first on the user's Claude subscription; `setup ci` adds optional GitHub automation (PR review, evals, build triage, monitor) with a subscription token or API key. Use when ai-sdlc is not yet initialized, when asked to set up / harden the harness, or for /ai-sdlc:setup [ci].
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
Ask with **one** `AskUserQuestion` call holding two questions.
1. **"Which apps are you building?"** — header `Surfaces`, `multiSelect: true`:
   - **Web** — browser app (Nuxt + Nuxt UI, or Next + shadcn/ui; SPA)
   - **Mobile** — iOS + Android (Flutter)
   - **Desktop** — Windows/macOS/Linux (Tauri v2)
2. **"How should the backend be set up?"** — header `Backend`, single select:
   - **Fullstack (one app)** — a Nuxt/Next app on Cloudflare Workers with D1, KV and R2 is both the web app and the API. Best for CRUD, internal tools, content and dashboards with one team. Mobile/desktop clients call its `/api` routes. Desktop-only: the Tauri Rust side is the whole backend (local SQLite).
   - **Separated backend** — Go API (OpenAPI contract-first, Postgres in Docker) shared by every client; the web app is a thin BFF. Best for several clients, transactional domains, long-running jobs, heavy reporting or self-hosting.
   Recommend one in the option label with "(Recommended)": separated when 2+ surfaces include mobile or desktop together with web, or the user mentioned payments/multi-tenant/integrations/jobs; fullstack otherwise.

Then run `sdlc stack --surfaces <comma list, lowercase> --backend <fullstack|separated>` (add `--ui react` only if the repo is already React or the user asks for React/shadcn). It maps the answers to components (fullstack → `edge-web` [+ `flutter`] [+ `tauri`]; separated → `go-api` [+ `bff-web`] [+ `flutter`] [+ `tauri`]), writes `.sdlc/stack.json` and merges each component's verify commands, protected generated paths, formatters and production-gate patterns into `.sdlc/config.json`. Then continue with the **stack** skill from "§2 Record" step 1 (ADR) and step 3 (CLAUDE.md "Stack" section) — the decision itself is made.

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
