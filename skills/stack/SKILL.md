---
name: stack
description: Decide and record the tech stack for a new app or surface — opinionated, no committee. Web simple → Nuxt 4 full-stack on Cloudflare (D1/KV/R2); web complex → Nuxt/Next BFF + Go API + Postgres in Docker; mobile → Flutter; desktop → Tauri v2 with a Nuxt UI or shadcn/ui SPA and Rust as BFF; SSR off everywhere. Writes .sdlc/stack.json, merges verify/protected-path/deploy-gate presets into .sdlc/config.json, and an ADR. Use when starting a new app, adding a surface (mobile/desktop/API), or when a spec needs a stack choice; or /ai-sdlc:stack.
argument-hint: "[what the app is, who uses it, which surfaces]"
---

# Stack — decide with confidence, record it, move on

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`.

If `.sdlc/stack.json` exists, the stack is decided — read it and the matching reference, don't re-litigate. Changing it is a tier-L change with an ADR (`sdlc stack … --force` after approval).

**Existing project** (`sdlc inspect` finds apps): don't choose a stack — record the one that's there with `sdlc stack --detect` (see **setup** §5a). Profiles then guide new code only in matching apps; moving an existing app onto a profile is a tier-L change with an ADR.

For a **new** project: if the surfaces and backend aren't known yet, ask them exactly as in the **setup** skill §5 (one AskUserQuestion: Surfaces multi-select web/mobile/desktop + Backend fullstack/separated) and record with `sdlc stack --surfaces … --backend …`. Step 1 below is how you choose the *recommendation* — and how you decide yourself when the user says "you decide".

## 1. Decide (from the intent/spec; ask only if a signal below is genuinely unknown)

**Web — pick `edge-web` when ALL hold:**
- one client (the web app itself); no mobile/desktop app consuming the same API now or within the roadmap the user describes
- CRUD / content / internal tool / dashboard; relational data fits SQLite (D1: modest write concurrency, ≤ ~10 GB per DB, no Postgres-only features)
- background work fits Workers limits (Queues, Cron Triggers, short jobs) — no long-running workers, no heavy reporting/analytics queries
**Otherwise `bff-web` + `go-api`** (multi-client, transactional domain, row locks, long jobs, complex reporting, separate backend team, or on-prem/self-hosted requirement).

**Mobile** → `flutter` + `go-api` by default (the contract is shared and versioned). With **fullstack**, Flutter calls the edge-web app's `/api` routes — fine for a companion app; keep those routes versioned (`/api/v1`) and backward compatible for old app versions, and move to separated when the mobile app becomes a primary client.
**Desktop** → `tauri`. Desktop-only + fullstack = local-first app (Rust + SQLite, no server). Add `go-api` (separated) if it needs server sync, multi-user data or shared business rules; with fullstack + web it calls the edge-web `/api`.

**UI variant** (one per repo, all surfaces): **Vue/Nuxt + Nuxt UI** by default — Nitro's first-class Cloudflare preset, one UI kit across web and desktop. **React/Next + shadcn/ui** when the repo/team is already React or a must-have library is React-only. Tailwind v4 either way. **SSR disabled** everywhere (SPA; server code lives in API/server routes only).

Why these defaults (say this in one line if the user asks): fewest moving parts that still scale — edge-web is a single deploy with managed storage; when you outgrow it, the BFF + contract-first Go API keeps one typed contract for web, mobile and desktop; Flutter and Tauri give one codebase per surface class with native performance and small binaries; Rust/Go BFFs keep tokens out of the client.

## 2. Record
1. Write `docs/sdlc/adr/0001-stack.md` (next free number if adr/ exists): context (the signals from step 1), decision (components, UI variant, SSR off), alternatives rejected (one line each), consequences (what would trigger a move, e.g. edge-web → bff-web + go-api when a second client appears).
2. `sdlc stack --components <list> --ui <vue|react> --adr docs/sdlc/adr/0001-stack.md [--dirs go-api=backend,…]` — e.g. `--components bff-web,go-api,flutter`. A single component lives at the repo root; several → monorepo dirs `web/ api/ mobile/ desktop/` + `contracts/openapi.yaml`. This writes `.sdlc/stack.json` and merges verify commands, protected (generated) paths, per-component formatters and extra production-gate patterns into `.sdlc/config.json` (existing verify entries are kept; `--force` replaces).
3. Update CLAUDE.md "Stack" section: 3–6 lines from each reference's "CLAUDE.md snippet"; make its Commands match `.sdlc/config.json#verify`.

## 3. Scaffold (only for a new app, inside an approved plan)
Follow the "Scaffold" section of each chosen reference in `${CLAUDE_PLUGIN_ROOT}/skills/stack/references/`:
- `web-edge.md` — Nuxt/Next full-stack on Cloudflare Workers
- `web-bff-go.md` — BFF + Go API + Postgres + contract
- `mobile-flutter.md`
- `desktop-tauri.md`
If house scaffold skills are installed (e.g. `nuxt-scaffold`, `next-scaffold`, `go-scaffold`), you may use them as the starting point; then reconcile with the reference and record differences in the ADR.
Use current stable versions at scaffold time (check with the package manager, don't trust memory), pin them in lockfiles. After scaffolding, `sdlc verify` must be green on the empty app before any feature work.
