# App template: Nuxt full-stack on Cloudflare

The starting point for apps built by non-engineers (HR, marketing, PMs, designers) with Claude, following the [AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook). People describe what they want. Claude builds it, proves it with screenshots, has it reviewed, and ships it. Nobody has to wait for an engineer.

## The stack (fixed)

| Layer | What |
| --- | --- |
| App | Nuxt 4 on Cloudflare Workers |
| UI | [Nuxt UI](https://ui.nuxt.com), inside a template shell in `layers/ui/`: **dashboard** for internal apps, **landing** for public ones, **starter** for prototypes. Each is curated from [nuxt-ui-templates](https://github.com/nuxt-ui-templates) at a pinned commit (`ui-templates/`) and installed with `pnpm ui:template`. |
| State | Pinia Colada for server data (one file per kind of data in `app/queries/`), Pinia for client-only state |
| Data | D1 through Drizzle, KV for settings. Landing-page copy is in `content/landing.yml` (Nuxt Content). |
| Sign-in | Cloudflare Access for staff, Turnstile for public forms |
| Settings | `app/app.config.ts`: name, menu, colours, `locale` (dates and Nuxt UI labels, default `vi-VN`), `lang` (the page language), `timeZone` |

## How work flows

Five skills, always in this order. Each one moves the idea's file, `intent/<slug>.md`, one step further. That file is the record of why the change exists. Every question is asked as a pick-list.

| Skill | What happens |
| --- | --- |
| `/ai-sdlc:idea` | The person's problem in their own words, at most 5 questions. Nothing is built. |
| `/ai-sdlc:shape` | 2–5 examples ("When I …, I see …") that they explicitly approve |
| `/ai-sdlc:build` | Technical plan, a plan review before any code (yellow/red), then an implementer builds (checks first) and a fresh verifier audits it against the intent, up to 3 rounds |
| `/ai-sdlc:check` | A screenshot next to each example: "Is this what you wanted?" |
| `/ai-sdlc:ship` | Engineer review on the local commit, then push once, open the pull request, post the review, merge. The pipeline deploys. |

## Risk tiers and review

A deterministic script (`scripts/risk-tier/`) decides every change's tier. It runs in the Claude session and again at merge.

| Tier | Examples | Who clears it |
| --- | --- | --- |
| 🟢 green | pages, wording, layout | the automatic checks |
| 🟡 yellow | new stored data, new server routes, changed checks | the engineer review |
| 🔴 red | personal data, outside services, new libraries, sign-in, engineer-owned files | the engineer review |

**The engineer review** runs in the person's own Claude session at `/ai-sdlc:ship`, before anything is pushed:
- A separate `ai-sdlc:engineer-reviewer` subagent (from the ai-sdlc plugin) reviews the branch against `REVIEW.md` with a fresh context. It isn't told what was built or why.
- Its findings are **warnings, never blockers**. `/ai-sdlc:ship` offers to fix them, and each fix gets a new review.
- The review is posted on the pull request for the exact commit it read. The merge gate accepts it only for the PR's current commit.
- It's a **record, not a lock**, so the hard limits are elsewhere: the session hook blocks secrets, destructive migrations, deploys and edits to engineer-owned files; production refuses to run anything not deployed from `main`; and `"claudeReview": false` in `app.registry.json` hands yellow and red back to people.

## Going live

- **Deploys come only from `main`, through Cloudflare Workers Builds.** `scripts/deploy-guard.mjs` refuses any other branch, and the production Worker returns 503 unless it was deployed that way.
- **Previews run on a separate `-preview` Worker** with its own database.
- **Feedback loop:** a "Report a problem" button on every page. Reports appear at `/reports` and become the next `intent/*.md`.

## Where to look

| For | Read |
| --- | --- |
| Engineers setting up an app | [docs/SETUP.md](docs/SETUP.md) |
| Claude (and curious owners) | [CLAUDE.md](CLAUDE.md) |
| What the engineer review checks | [REVIEW.md](REVIEW.md) |
| The rules behind the tiers | [scripts/risk-tier/rules.json](scripts/risk-tier/rules.json) |

```bash
pnpm install && pnpm db:migrate:local && pnpm dev   # run locally
pnpm check                                           # typecheck + script tests + browser checks
pnpm risk                                            # this branch's tier, in plain words
pnpm ui:template [dashboard|landing|starter]         # engineers: install or switch the UI shell
```
