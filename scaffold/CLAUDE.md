# CLAUDE.md

The person you're working with is usually **not an engineer** (HR, marketing, a PM, a designer). Talk in outcomes, not code. Don't show code, file paths or error dumps unless they ask. Before every step that changes the app, say in one sentence what will change for the people who use it. **Ask every question with the `AskUserQuestion` tool, giving 2–4 concrete options.** Never ask them to type an answer from scratch.

## The stack is fixed

Nuxt 4 full-stack on Cloudflare Workers. **UI:** Nuxt UI components, inside the template shell installed in `layers/ui/`. **State:** Pinia Colada for everything fetched from the server; Pinia stores (`app/stores/`) only for client-side state shared across pages. **Data:** D1 (SQLite, via Drizzle), with KV for settings and cache. No other framework, database, UI or state library, or hosting. If a request needs something outside this, say so plainly. Don't work around it.

- **Pages** go in `app/pages/` and follow the structure of the template's pages in `layers/ui/app/pages/` (a dashboard page is a `UDashboardPanel`). To change a template page, copy it into `app/pages/` and edit the copy. Never edit `layers/`.
- **Menus, app name, colours and locale** live in `app/app.config.ts`. Show dates with `formatDate()`, and take them with `UInputDate`. Never hard-code a locale. Landing-page words live in `content/landing.yml`.
- **Server data:** one file per kind of data in `app/queries/`, with `useQuery` for reads (via `useRequestFetch()`) and `useMutation` for writes, invalidating the read's key. Pages call these composables and never call `$fetch` themselves.

## How work flows

Five skills, always in this order. Each one leaves the `intent/<slug>.md` file one step further, and that file is the record of why the change exists.

| Skill | Status after | What happens |
| --- | --- | --- |
| `/ai-sdlc:idea` | draft | Their problem, in their words, on a new branch. Nothing is built. |
| `/ai-sdlc:shape` | agreed | 2–5 examples ("When I …, I see …") that they explicitly approve, checked against `POLICIES.md` |
| `/ai-sdlc:build` | built | Technical plan, a plan review (yellow/red), then an implementer builds and a fresh verifier checks it, up to 3 rounds |
| `/ai-sdlc:check` | built | Screenshots next to each example. "Is this what you wanted?" |
| `/ai-sdlc:ship` | shipped | Pull request, tier explained, who approves what. The pipeline deploys. |

If someone asks for a change directly, start at `/ai-sdlc:idea`, even for something small. It takes a minute and keeps the record. Engineers also have `/ai-sdlc:triage` (problem reports → draft intents), `/ai-sdlc:report` (delivery metrics) and `/ai-sdlc:learn` (repeated issues → lessons in `LEARNED.md`).

## Risk tiers

Green changes ship after the checks pass. Yellow and red changes get an engineer review at `/ai-sdlc:ship`: a separate `ai-sdlc:engineer-reviewer` subagent checks the branch against `REVIEW.md`, and its findings are warnings you offer to fix before merging. The session hook blocks some changes outright, refuses to push a yellow or red commit before its engineer review, and tells you when the tier changes. CI decides the tier again at merge time. **Never try to lower a tier by working around a rule.** Say what the rule protects and move on.

## Rules

- Server routes that save or change data must call `requireUser(event)` (staff) or `verifyTurnstile(event, token)` (public forms). Read routes for staff data call `requireUser(event)`.
- Database: change `server/db/schema.ts`, run `pnpm db:generate`, then `pnpm db:migrate:local`. Only **add** tables and columns. Never rename, drop or rewrite, and never edit an existing file in `migrations/`.
- Never put secrets, passwords or API keys in any file. Engineers set them in Cloudflare.
- No new libraries in `package.json` unless the idea needs one. It triggers an engineer review.
- No calls to outside services or third-party scripts (analytics, pixels, APIs) unless the idea needs them. They trigger an engineer review.
- Store personal data (contact details, pay, health, ID numbers) only when the idea needs it, and show it only to signed-in staff. It triggers an engineer review.
- Engineer-owned, don't edit: `.github/`, `.claude/`, `scripts/`, `wrangler.jsonc`, `app.registry.json`, `drizzle.config.ts`, `server/utils/access.ts`, `server/utils/turnstile.ts`, `server/middleware/`, `colada.options.ts`, `REVIEW.md`, `POLICIES.md`, `LEARNED.md`, this file.
- Don't edit an existing test to make it pass. If an example was wrong, change the intent with the person first.
- Build and deploy scripts in `package.json` are engineer-owned. Production only runs code merged to `main`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the app locally at http://localhost:3000 with a local database |
| `pnpm db:generate` / `pnpm db:migrate:local` | Creates / applies a database change locally |
| `pnpm check` | Typecheck + risk-tier tests + example checks (with screenshots) |
| `pnpm risk` | Shows this branch's risk tier and why |

In local dev, sign-in and the bot check are skipped: you're `dev@localhost`.

## Learned in this app

@LEARNED.md
