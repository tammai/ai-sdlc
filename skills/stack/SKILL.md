---
name: stack
description: Decide and record the tech stack for a new app or surface — Claude's own picks by default (React + Hono at the edge, React SPA + Go API, Expo, Tauri + React) or "From templates" (Nuxt on Cloudflare, Nuxt SPA + Go API + Postgres, Flutter, Tauri + Vue); a BFF only in front of an existing API; SSR off everywhere except static sites (a Nuxt landing page or marketing site, prerendered at build time). Writes .sdlc/stack.json, merges verify/protected-path/deploy-gate presets into .sdlc/config.json, and an ADR. Use when starting a new app, adding a surface (mobile/desktop/API), or when a spec needs a stack choice; or /ai-sdlc:stack.
argument-hint: "[what the app is, who uses it, which surfaces]"
---

# Stack — decide with confidence, record it, move on

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`. Run it inline as `node "<that path>" <args>` every time; never put the command in a shell variable (zsh does not word-split `$sdlc`) and never define a shell function (it does not parse in PowerShell).

If `.sdlc/stack.json` exists, the stack is decided — read it and the matching reference, don't re-litigate. Changing it is a tier-L change with an ADR (`sdlc stack … --force` after approval).

**Existing project** (`sdlc inspect` finds apps): don't choose a stack — record the one that's there with `sdlc stack --detect` (see **setup** §5a). Profiles then guide new code only in matching apps; moving an existing app onto a profile is a tier-L change with an ADR.

For a **new** project: ask exactly as in the **setup** skill §5b ("Let Claude choose" first and recommended, or "From templates"; surfaces; and — for "From templates" — the backend), then record with `sdlc stack --choice … --surfaces … --backend …`. The UI vibe is asked right after the stack is recorded and before scaffolding (setup §5c). Step 1 below is how you recommend a backend, and how you decide when the user lets Claude choose.

## 1. Decide (from the intent/spec; ask only if a signal below is genuinely unknown)

**Backend.** Whether an API already exists is a fact, so ask the user (setup §5b question 3); never assume:
- **existing-own**: the team's own existing API (another repo) that it can change. Web gets `spa-web` (static SPA + passthrough Worker) pointed at it via `--api-url`; no BFF and no new Go API. That API should own sessions (a cookie for web, bearer for native) as in `contracts/openapi.yaml`; if it doesn't yet, that's its first change, done in the API's repo.
- **existing** — the app consumes an API the team doesn't control (third-party, another department's, legacy). Web gets `bff-web`: the BFF holds that API's tokens or keys server-side and gives the browser a cookie session; it also reshapes calls when the API doesn't fit the screens. Mobile/desktop call the API directly. Replace `contracts/openapi.yaml` with that API's spec.
- **fullstack** (`edge-web`) when ALL hold: one main client; CRUD / content / internal tool / dashboard; data fits SQLite (D1: modest write concurrency, ≤ ~10 GB per DB); background work fits Workers limits (Queues, Cron, short jobs).
- **separated** (`spa-web` + `go-api`) otherwise: several clients, transactional domain, long jobs, heavy reporting, separate frontend team, or self-hosted on AWS/GCP/DO/VPS. **No BFF**: the Go API owns accounts and sessions (cookie for web, bearer for native; password, optional magic link, OIDC), and the SPA reaches it same-origin through a passthrough Worker on Cloudflare (`/api/*` → API, no logic). A full BFF in front of your own API needs an ADR (several backends to aggregate, or a frontend team owning UI-specific endpoints).

**Mobile** → `flutter` (default) / `expo` (Claude's choice), calling the API with bearer tokens. With fullstack, it calls the edge app's `/api` — fine for a companion app; keep those routes versioned and backward compatible, and move to separated when mobile becomes a primary client.
**Desktop** → `tauri` (Vue + Nuxt UI default / React for Claude's choice). Desktop-only + fullstack = local-first (Rust + SQLite). Add `go-api` (separated) for server sync or multi-user data.

**Website** → `site-marketing` or `site-landing`, always Nuxt (SSG) whichever stack choice was made, deployed as static assets on Cloudflare Workers; no backend. Pick marketing when there is a blog or news, non-developers edit the content, there are many pages, or there is media (images, video, downloads: served from R2); landing for a handful of pages one developer maintains. Anything with accounts, stored form data or per-user pages is not a site: it is an app. Details in `references/site-static.md`.

**UI** (one per repo, all surfaces), SSR off everywhere, Tailwind v4 — the one exception is a static site: `nuxt generate` with `ssr: true` renders pages to HTML at build time and nothing renders at runtime (recorded per component as `render: prerender` in `.sdlc/stack.json`). Never switch a site to `ssr: false`; it would ship an empty shell with no SEO. Sites stay out of the shared `packages/ui-layer`.
- **From templates:** Vue + Nuxt UI everywhere — one UI kit across web and desktop. **Web is always Nuxt** (`edge-web`, `spa-web` with `ssr: false`, `bff-web`): one project layout across web repos — file routing, layouts, route middleware, modules — whether or not its server is used. **Desktop is Vite + Vue** (`tauri`): the Tauri webview needs only a static frontend, with file routing via Vue Router's file-based routing.
- **Claude's choice:** React + shadcn/ui; Vite SPA (no Next — SSR is off), Hono API at the edge for fullstack apps, Expo on mobile. Reasons: models write and review React most reliably; shadcn components live in the repo where they can be edited; one UI language across web, desktop and mobile; fewer moving parts than Next on Cloudflare.

## 2. Record
1. Create the ADR with `sdlc adr "Stack - <one-line summary>"` (numbers it from the template, usually `docs/sdlc/adr/0001-…`; the CLI quotes a title that needs it, but a title without a colon reads better in the file name). Fill the template's sections (delete the options-table columns you don't need), then accept it with `sdlc adr --accept <n> --by "<name>"`, because the user made the choice in setup. Content: context (the signals from step 1), decision (components, UI variant, SSR off), alternatives rejected (one line each), consequences (what would trigger a move, e.g. edge-web → bff-web + go-api when a second client appears).
2. `sdlc stack --components <list> --ui <vue|react> --adr <the ADR file> [--dirs go-api=backend,…]` — e.g. `--components bff-web,go-api,flutter`. A single component lives at the repo root; several → monorepo dirs `web/ api/ mobile/ desktop/` + `contracts/openapi.yaml`. This writes `.sdlc/stack.json` and merges verify commands, protected (generated) paths, per-component formatters and extra production-gate patterns into `.sdlc/config.json` (existing verify entries are kept; `--force` replaces).
   Coming from setup, the stack is already recorded without an ADR: link it afterwards with `sdlc stack --adr <file>` (it updates only the ADR field; `--force` is not needed and would reset verify and formatters).
3. CLAUDE.md "Stack" section: when you will run `sdlc scaffold-app`, skip this: scaffold-app merges each template's notes there, and a second hand-written block would duplicate them. Otherwise (no scaffold, or hand-built pieces) write 3–6 lines from each reference's "CLAUDE.md snippet" and make its Commands match `.sdlc/config.json#verify`.

## 3. Scaffold (only for a new app, inside an approved plan)
`sdlc scaffold-app` — copies the full app template for every component in `.sdlc/stack.json` (`templates/apps/<id>`: edge-web-nuxt/next, bff-web-nuxt/next, go-api, flutter, tauri-nuxt/react), fills in the app name, copies the shared `contracts/openapi.yaml` and `docker-compose.yml` where needed, installs from the pinned lockfiles, writes the verify commands into `.sdlc/config.json`, merges each template's notes into CLAUDE.md "Stack", and runs verify. Every template ships one working **notes** slice (list + create, validation, UI states, tests) — it's the pattern to copy for the first real feature, and can be deleted once real features exist.
- Options: `--name <app>` (default: folder name), `--ui vue|react`, `--no-install` (copy only), `--no-verify`.
- Missing toolchain (e.g. Flutter not installed) → the install step fails for that component; tell the user what to install and re-run with that component name only.
- It refuses non-empty component folders; existing projects never get a template (setup §5a).
- Templates pin versions at the time they were verified (`template.json#verified`). After scaffolding, upgrading dependencies is an ordinary change.
After scaffolding, `sdlc verify` must be green before any feature work; commit as `chore: scaffold <app> from ai-sdlc templates` (when this ran inside setup, setup §6's single `chore: adopt ai-sdlc` commit covers it).
