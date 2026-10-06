---
name: setup
description: Bootstrap a repository for the AI-native SDLC — .sdlc/config.json with verify commands, the docs/sdlc artifact chain, a one-page CLAUDE.md with a verification block, REVIEW.md, then ask what's being built (web/mobile/desktop, fullstack or separated backend) and record the stack. Local-first on the user's Claude subscription; `setup ci` adds optional GitHub automation (PR review, evals, build triage, monitor) with a subscription token or API key. Use when ai-sdlc is not yet initialized, when asked to set up / harden the harness, or for /ai-sdlc:setup [ci].
argument-hint: "[ci]"
---

With argument `ci`: skip to the last section, "Mode: setup ci".

# Setup

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`. Work in this order; each step is useful on its own (the playbook's "starting plays").

## 1. Core (always)
1. `sdlc init` — writes `.sdlc/config.json` (auto-detected `verify` commands), `.sdlc/.gitignore` (`local/`), `docs/sdlc/README.md`.
2. Open `.sdlc/config.json` and make `verify` right: every entry must exit non-zero on failure and run without prompts. Order: fast → slow (typecheck, lint, build, test). Run `sdlc verify` once. If anything fails on a clean tree, fix the command (not the code) or tell the user the baseline is red. If there's no app yet, leave `verify` empty — §5 fills it from the stack.
3. Fill the rest of config with the user only where it matters:
   - `protectedPaths`: generated code (`src/gen/**`, `**/*.g.dart`, `internal/db/sqlc/**`, `api/openapi.gen.ts`), frozen packages, vendored code.
   - `formatOnEdit`: file-scoped formatter, e.g. `npx prettier --write {file}`, `gofmt -w {file}`, `dart format {file}`. Keep it fast.
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

## 5. What are we building? (always, unless `.sdlc/stack.json` already exists)
Ask with **one** `AskUserQuestion` call holding two questions. If the repo already contains an app (package.json with nuxt/next, go.mod, pubspec.yaml, src-tauri/), put "(detected)" on the matching options and list them first.
1. **"Which apps are you building?"** — header `Surfaces`, `multiSelect: true`:
   - **Web** — browser app (Nuxt + Nuxt UI, or Next + shadcn/ui; SPA)
   - **Mobile** — iOS + Android (Flutter)
   - **Desktop** — Windows/macOS/Linux (Tauri v2)
2. **"How should the backend be set up?"** — header `Backend`, single select:
   - **Fullstack (one app)** — a Nuxt/Next app on Cloudflare Workers with D1, KV and R2 is both the web app and the API. Best for CRUD, internal tools, content and dashboards with one team. Mobile/desktop clients call its `/api` routes. Desktop-only: the Tauri Rust side is the whole backend (local SQLite).
   - **Separated backend** — Go API (OpenAPI contract-first, Postgres in Docker) shared by every client; the web app is a thin BFF. Best for several clients, transactional domains, long-running jobs, heavy reporting or self-hosting.
   Recommend one in the option label with "(Recommended)": separated when 2+ surfaces include mobile or desktop together with web, or the user mentioned payments/multi-tenant/integrations/jobs; fullstack otherwise.

Then run `sdlc stack --surfaces <comma list, lowercase> --backend <fullstack|separated>` (add `--ui react` only if the repo is already React or the user asks for React/shadcn). It maps the answers to components (fullstack → `edge-web` [+ `flutter`] [+ `tauri`]; separated → `go-api` [+ `bff-web`] [+ `flutter`] [+ `tauri`]), writes `.sdlc/stack.json` and merges each component's verify commands, protected generated paths, formatters and production-gate patterns into `.sdlc/config.json`. Then continue with the **stack** skill from "§2 Record" step 1 (ADR) and step 3 (CLAUDE.md "Stack" section) — the decision itself is made.

Don't scaffold the app here: scaffolding is the first change. Offer it: "Want me to scaffold it now? (`/ai-sdlc:vibe scaffold the app`)" — that runs as a tier-M change with a plan, and `sdlc verify` must be green on the empty app before feature work.

## 6. Finish
- Recommend branch protection on main: PR required, code-owner approval, required checks = the verify commands. Agents never push to main (the prod gate also asks on `git push … main`).
- Show what was created, and what still needs a human (secrets, branch protection). Suggest committing as `chore: adopt ai-sdlc`.

## Mode: `/ai-sdlc:setup ci` (only when asked)
CI automation runs Claude without a person present, so it needs a credential stored as a GitHub secret. Ask which one with AskUserQuestion:
- **Subscription token (Recommended)** — the user runs `claude setup-token` locally (Pro/Max), then `gh secret set CLAUDE_CODE_OAUTH_TOKEN` and pastes it. CI usage counts against that person's plan limits; use a team member's token they're comfortable sharing with the repo's workflows.
- **API key** — `gh secret set ANTHROPIC_API_KEY` (pay-as-you-go). In each scaffolded workflow, swap the commented auth line.
Never ask the user to paste the token into this session — they set the secret themselves (suggest `! gh secret set CLAUDE_CODE_OAUTH_TOKEN`).
Then offer, as one multi-select: Claude PR review + `@claude` (`sdlc scaffold ci-review`; needs branch protection with code-owner approval), agent evals in CI (`sdlc scaffold evals ci-evals`), failed-build triage (`sdlc scaffold ci-triage`; set `workflows:` to the CI workflow's name), close-the-loop monitor (`sdlc scaffold ci-monitor`; needs a deployed app and a metric with history), managed-settings reference (regulated orgs). Mention cost: each run consumes plan usage or API spend; the monitor only invokes Claude on a 2σ+ breach.
