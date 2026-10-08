---
name: setup
description: Bootstrap a new or existing repository for the AI-native SDLC — .sdlc/config.json with verify commands, the docs/sdlc artifact chain, a one-page CLAUDE.md with a verification block, REVIEW.md. Existing projects keep their stack (detected, verify from their own scripts, already-failing checks baselined); new projects let Claude choose the stack (the default) or build from templates, choose which apps to build (web, mobile, desktop, or a static website: landing page or marketing site), and the backend (fullstack, new separate Go API, or an existing API behind a BFF), then pick the UI vibe (recorded in DESIGN.md and applied to the scaffold). Local-first on the user's Claude subscription; `setup ci` adds optional GitHub automation (PR review, evals, build triage, monitor) with a subscription token or API key. Use when ai-sdlc is not yet initialized, when asked to set up / harden the harness, or for /ai-sdlc:setup [ci].
argument-hint: "[ci]"
---

With argument `ci`: skip to the last section, "Mode: setup ci".

# Setup

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`. Run it inline as `node "<that path>" <args>` every time; never put the command in a shell variable (zsh does not word-split `$sdlc`) and never define a shell function (it does not parse in PowerShell). Work in this order; each step is useful on its own (the playbook's "starting plays").

## 0. New or existing?
`sdlc inspect` — lists detected apps (folder, framework, matching stack profile or "no profile") and the verify commands built from each app's **own** scripts with its **own** package manager. "no app detected" = new project. This decides §5.

## 1. Core (always)
1. `sdlc init` — writes `.sdlc/config.json` (verify commands from detection; never scripts the project doesn't define), `.sdlc/.gitignore` (`local/`), `docs/sdlc/README.md`. It never touches existing source files.
2. Check `verify` in `.sdlc/config.json`: every entry must exit non-zero on failure and run without prompts. Order: fast → slow (typecheck, lint, build, test). If the project runs checks differently (a root Makefile, `turbo`, `nx`), replace the entries with those commands. New project with no app yet: leave `verify` empty — §5 fills it.
3. Fill the rest of config with the user only where it matters:
   - `protectedPaths`: generated code that exists in this repo (`src/gen/**`, `**/*.g.dart`, `internal/db/sqlc/**`, `api/openapi.gen.ts`), frozen packages, vendored code. Never protect hand-written files.
   - `formatOnEdit`: for an **existing** project, off unless the user agrees (it rewrites each edited file; §5a asks). For a **new** project it is set by `sdlc stack` in §5b, which says what it did; nothing to decide here.
   - `prodGate`: `ask` (default — the user approves in the permission prompt) or `deny` (requires `RELEASE_APPROVAL=<ticket>` in the launching shell).
   - Override `prodPatterns` only to add the repo's real deploy commands.

## 2. CLAUDE.md (institutional knowledge)
- If none exists: `sdlc scaffold claude-md`, then fill it from the repo (what `/init` would find): commands, conventions, architecture, and "Things Claude gets wrong" (start empty). Trim to one page.
- If one exists: merge in only the **Workflow** and **Verifying your work** sections from `${CLAUDE_PLUGIN_ROOT}/templates/repo/CLAUDE.md`. Don't rewrite the user's content.
- Commands listed must match `.sdlc/config.json#verify` exactly. **New project:** `verify` is empty and there is no stack yet, so only write the title and the parts you know now; fill Commands (from the final `verify` entries, written as `pnpm run <script>`; a "Run locally" line such as `pnpm dev` is fine too, since it is not a check), Conventions and Architecture after §5b and the scaffold in §5c, and keep the scaffolded "Stack" block, except its first "Commands:" line: delete that line once you have filled the Commands section, so each fact is written once. Keep the file's header comment ("Keep this under one page…").

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
**First call:** one `AskUserQuestion` with three questions. Ask all three; never assume an answer, with one exception: when the request itself says it is a website only (a landing page or marketing site, "no app, no accounts"), drop question 3 (the API question has no meaning without a backend), say the one-liner under "Website is the only surface" below, and ask the other two.
1. **"How should the stack be chosen?"** (header `Stack`, single select)
   - **Let Claude choose (Recommended).** Always the first option and the default. Claude picks what it's most confident building and verifying for this app: React + shadcn/ui on web and desktop (Hono API at the edge for simple apps), Expo on mobile, Go + Postgres for a new separate backend.
   - **From templates.** The team's standard stack from the ai-sdlc templates: Vue + Nuxt UI on web and desktop (Nuxt on the web, Vite + Vue in a desktop-only app), Flutter on mobile, Go + Postgres for a new separate backend.
2. **"Which apps are you building?"** (header `Surfaces`, `multiSelect: true`): **Web** (browser SPA) · **Mobile** (iOS + Android) · **Desktop** (Windows/macOS/Linux, Tauri v2) · **Website** (a static landing page or marketing site, no accounts or data of its own).
3. **"Does this app use an existing backend API?"** (header `API`, single select). This is a fact only the user knows, so ask it on both paths.
   - **No, build the backend too.** Nothing exists yet; the backend is part of this project.
   - **Yes, our own API, and we can change it.** Another repo or service the team owns. Web gets a static SPA and a passthrough Worker pointed at it (no BFF, no new Go API). That API should own sessions as in `contracts/openapi.yaml`: a cookie for web, bearer tokens for native. If it doesn't yet, that's its first change, done in the API's repo.
   - **Yes, an API we don't control.** Third-party, another department's, or legacy. Web gets a BFF that keeps that API's tokens or keys server-side; mobile and desktop call it directly.

**Website is the only surface** (from the request, or from the Surfaces answer): the Stack answer doesn't change anything (a site is Nuxt on both choices) and the API answer doesn't apply (a site has no backend). Say that in one line (e.g. "A website needs no backend and is Nuxt on either stack choice, so I'm recording no backend and skipping the backend questions.") and record no backend; don't ask the backend questions below. If Website is picked together with apps, the Stack, API and backend answers are for the apps and the site is an extra component.

**Site kind, when Website is among the surfaces:** a second `AskUserQuestion`, **"What kind of website?"** (header `Site`). It is the second call, so with Website alone it is the only question in it; with apps too, it goes in the same call as the backend question when both are needed.
- **Landing page.** A handful of static pages one developer maintains (home, about, contact, privacy). Nuxt SSG on Cloudflare, no content system, no R2.
- **Marketing site.** A blog and Markdown pages that other people edit (Nuxt Content), many pages, or images and video: media is served from R2. Mark it "(Recommended)" when the idea mentions a blog, news, editors, or media; otherwise mark Landing page.

**Backend, only when the answer to 3 is "No, build the backend too" and there is an app surface:**
- **Let Claude choose:** a second `AskUserQuestion` about the facts that drive the decision. Don't ask which architecture; Claude still decides.
  **"What will the backend need?"** (header `Needs`, `multiSelect: true`)
  - **Payments, multi-tenant or sensitive data**: money, several customer organisations, or regulated/personal data.
  - **Background jobs, integrations or heavy reporting**: scheduled or long-running work, third-party syncs, analytics queries.
  - **Large scale or a separate backend team**: many users or heavy writes, or the backend is owned by other people.
  - **None of these, a simple app**: CRUD, an internal tool, content or a dashboard.

  Decide:
  - **separated** (new Go API) if any of the first three is picked, or web is combined with mobile or desktop;
  - **fullstack** otherwise.

  Say the choice in one line with its reason (e.g. "Separate Go API: payments + a mobile app need one contract and row-level transactions"), and record the picked needs in the stack ADR. If the user's description already answers this unambiguously, skip the question and say what you inferred.
- **From templates:** a second `AskUserQuestion`, **"Where does the data live?"** (header `Backend`):
  - **Fullstack (one app).** The Cloudflare app (Workers + D1/KV/R2) is the web app and the API. CRUD, internal tools, content, dashboards; one team. Mobile/desktop call its `/api`; desktop-only = local-first Tauri (Rust + SQLite).
  - **New separate backend.** A Go API (OpenAPI contract-first, Postgres, hosted on AWS/GCP/DO/any VPS) owns accounts and sessions for every client. The web SPA reaches it through a passthrough Worker on its own origin (no BFF). For several clients, transactional domains, jobs, heavy reporting, or a separate frontend team.

  Mark one "(Recommended)": separate backend when web is combined with mobile/desktop, or for payments/multi-tenant/integrations/jobs; fullstack otherwise.

Map the answers to `--backend`:
- 3 = No → `fullstack` or `separated`
- 3 = own API → `existing-own`
- 3 = API we don't control → `existing`

Then run `sdlc stack --choice <claude|templates> --surfaces <comma list> --backend <fullstack|separated|existing-own|existing> [--site <landing|marketing>]` (omitting `--choice` means `claude`; `--site` is required when the surfaces include `site`; for a website alone omit `--backend`: `sdlc stack --surfaces site --site marketing`). It maps the answers to components and records them in `.sdlc/stack.json`:
| Backend | claude (default) | templates |
|---|---|---|
| fullstack | `edge-web` (React + Hono) | `edge-web` (Nuxt) |
| separated | `spa-web` (React SPA + passthrough Worker) + `go-api` | `spa-web` (Nuxt SPA + passthrough Worker) + `go-api` |
| existing-own | `spa-web` (React SPA + passthrough Worker), your API | `spa-web` (Nuxt SPA + passthrough Worker), your API |
| existing | `bff-web` (Next BFF) | `bff-web` (Nuxt BFF) |
| + mobile / + desktop | `expo` / `tauri` (React) | `flutter` / `tauri` (Nuxt next to a Nuxt web app, Vue when desktop-only) |
| + website | `site-landing` or `site-marketing` (Nuxt SSG), same on both choices | `site-landing` or `site-marketing` (Nuxt SSG) |

`sdlc stack` also turns on the chosen stack's own formatter for a new project (`eslint --fix`, `gofmt`, `dart format` or `rustfmt` on each edited file): every file is new, so nothing someone wrote gets rewritten. Say so in one line and offer to turn it off (set `formatOnEdit` to `null` in `.sdlc/config.json`). `scaffold-app` does not change it. Existing projects are asked in §5a instead.

With either existing backend, ask for the API's OpenAPI spec (URL or file) and put it at `contracts/openapi.yaml` in place of the template's; then run `gen:api` in each client after scaffolding. If there's no spec, note it in the ADR and write one for the endpoints the app uses. `--ui vue|react` overrides the web/desktop UI when the user asks for it.

Then continue with the **stack** skill from "§2 Record": step 1 (create the ADR with `sdlc adr "<title>"`, fill it; for "Let Claude choose" it records Claude's reasons; for a site it records the SSR exception) and link it with `sdlc stack --adr <file>` (no `--force` needed). Skip its step 3 when you are going to scaffold: `sdlc scaffold-app` merges each template's notes into the CLAUDE.md "Stack" section (see below); write that section by hand only if they decline to scaffold.

## 5c. New project — what should it look like?
After the stack is recorded and before offering to scaffold. Ask once, in one `AskUserQuestion` call with two questions, and don't follow up. The presets and the decision rules are in `${CLAUDE_PLUGIN_ROOT}/skills/uiux/references/vibes.md` (the approach is borrowed from Hallmark: tone is a pick, not "clean and modern"; custom only on a brand anchor; ask once, let "you pick" through, state the inference). Audience and use case are not asked here: the idea and the intent stage already hold them.
1. **"What should the UI feel like?"** (header `Vibe`, single select)
   - **Let Claude choose (Recommended).** Claude infers it from what the app is and says which one it took and why.
   - **Crisp & technical.** Dev tools, B2B, dashboards. Cool neutrals, compact, hairlines.
   - **Warm & friendly.** Consumer apps. Warm neutrals, soft and rounded, comfortable.
   - **Editorial & bold.** Text-led products. Paper tones, a serif display face, sharp corners.
   A fourth preset, **Dark & atmospheric** (AI and media apps), is reached through Other, or by Claude inferring it; it is never the default. Other also takes free text: a preset name, or vibe words.
2. **"Do you have a brand colour, font or reference to anchor on?"** (header `Brand`, single select)
   - **No, use the preset's accent and fonts (Recommended).** (When Claude chose the preset, that is the preset it inferred.)
   - **Yes.** Choose Other and type it: a hex colour, a font, or an app or site to take one trait from. This switches the preset to custom (`vibes.md` § Custom).

Then:
1. `sdlc scaffold design-md` → `DESIGN.md`, and fill it as `vibes.md` § Landing the values says: the `Vibe:` line in §2 in the one format `vibes.md` § "The `Vibe:` line" gives (preset or `custom (base: …)`, how it was chosen, and the brand anchor if any), mood, density, signature detail, the real colour roles, type, radius and motion budget. Say the result in one line, e.g. "Vibe: Crisp & technical, because this is an internal ops dashboard. Say a different one and I'll redo the tokens."
2. The look is a decision for this repo only: don't add a field to `.sdlc/stack.json`. DESIGN.md is the record, and the **uiux** skill reads it from here on.

Then offer to scaffold: "Want me to create the app now from the ai-sdlc templates?" On yes: `sdlc scaffold-app --name <app-slug> --title "<Display Name>"` (see the **stack** skill §3; always pass `--title` with the real display name, because deriving it from the slug gives "Kettle And Fern" for "Kettle & Fern"), then land the DESIGN.md tokens in the template's token files (`vibes.md` § Landing the values) and run `sdlc verify` again. It's a fixed, verified template, so it doesn't need the intent→plan chain; it must end with verify green. Then replace the template's sample copy: `app/data/site.ts` holds the site name, nav and sample text of the pages (marketing: the home page; the other pages are `content/*.md`, and its sample posts, `features`/`pricing` pages and `media/blog/r2-cover.svg` describe the template itself, so replace or delete them as a first change, keeping at least one post and the validated frontmatter). Write copy only from what the user told you; keep it modest and descriptive, invent no metrics, prices, quotes, logos or testimonials, and list every product claim you wrote so the owner can confirm it.

If they say no to scaffolding, DESIGN.md still holds the vibe and the first UI change applies it (uiux mode A step 3). For a marketing site, tell them what the template deliberately leaves to a human: creating the R2 buckets, uploading real media, and the production deploy (`site-static.md` § Deploy). Then suggest committing, and `/ai-sdlc:vibe` for the first feature.

Existing projects (§5a) never get this question: the look is in the code, and the **uiux** skill derives DESIGN.md from it.

## 6. Finish
- Recommend branch protection on main: PR required, code-owner approval, required checks = the verify commands. Agents never push to main (the prod gate also asks on `git push … main`).
- Show what was created, the known-red checks (if any), and what still needs a human (secrets, branch protection). Suggest one commit for the whole setup, `chore: adopt ai-sdlc` (it includes the scaffold; the stack skill's per-scaffold message is for scaffolding outside setup).
- **Website:** list these as their own short checklist: the real contact address (`contactEmail` in `app/data/site.ts`; it ships as `hello@example.com`), the real host in `public/robots.txt`, `NUXT_PUBLIC_SITE_URL` at build time, and the production deploy. For a marketing site add the R2 steps with the real names from `wrangler.jsonc` (`<app>-media`, `<app>-media-staging`, `<app>-media-production`): `wrangler r2 bucket create <name>` once per environment, then upload media with `wrangler r2 object put <bucket>/<key> --file <path> --content-type <type> --remote`.
- Note in one line: the plugin's secrets guard and production-deploy prompt are active in every session where the plugin is enabled, set up or not; the plan gate, verify gate and formatter only act in repos set up like this one. From now on every message in this repo is checked against the ai-sdlc skills (a `UserPromptSubmit` hook adds a routing note; `"routePrompts": false` in `.sdlc/config.json` turns it off).

## Mode: `/ai-sdlc:setup ci` (only when asked)
CI automation runs Claude without a person present, so it needs a credential stored as a GitHub secret. Ask which one with AskUserQuestion:
- **Subscription token (Recommended)** — the user runs `claude setup-token` locally (Pro/Max), then `gh secret set CLAUDE_CODE_OAUTH_TOKEN` and pastes it. CI usage counts against that person's plan limits; use a team member's token they're comfortable sharing with the repo's workflows.
- **API key** — `gh secret set ANTHROPIC_API_KEY` (pay-as-you-go). In each scaffolded workflow, swap the commented auth line.
Never ask the user to paste the token into this session — they set the secret themselves (suggest `! gh secret set CLAUDE_CODE_OAUTH_TOKEN`).
Then offer, as one multi-select: Claude PR review + `@claude` (`sdlc scaffold ci-review`; needs branch protection with code-owner approval), agent evals in CI (`sdlc scaffold evals ci-evals`), failed-build triage (`sdlc scaffold ci-triage`; set `workflows:` to the CI workflow's name), close-the-loop monitor (`sdlc scaffold ci-monitor`; needs a deployed app and a metric with history), managed-settings reference (regulated orgs). Mention cost: each run consumes plan usage or API spend; the monitor only invokes Claude on a 2σ+ breach.
