# ai-sdlc

A Claude Code plugin for apps built by **non-engineers** (HR, marketing, PMs, designers), following the [AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook). People describe what they want. Claude builds it on a fixed stack, proves it with screenshots, has it reviewed by a separate reviewer, and ships it through a pipeline that only deploys reviewed code from `main`.

## Install

```
/plugin marketplace add tammai/ai-sdlc
/plugin install ai-sdlc@ai-sdlc
```

Apps made with `/ai-sdlc:new-app` also enable the plugin in their own `.claude/settings.json`, so opening an app in Claude offers to install it.

## What's in it

| | For | What it does |
| --- | --- | --- |
| `/ai-sdlc:idea` | anyone | The problem in their own words, as an `intent/*.md`. At most 5 questions, as pick-lists. |
| `/ai-sdlc:shape` | anyone | 2–5 examples ("When I …, I see …") they explicitly approve |
| `/ai-sdlc:build` | anyone | Technical plan, a browser check per example, then the code |
| `/ai-sdlc:check` | anyone | A screenshot next to each example: "Is this what you wanted?" |
| `/ai-sdlc:ship` | anyone | Engineer review on the local commit, then push once, open the PR, post the review, merge |
| `ai-sdlc:engineer-reviewer` | (subagent) | The independent review `/ai-sdlc:ship` runs for yellow and red changes. Read-only, fresh context, reviews against the app's `REVIEW.md`. Findings are warnings. |
| `/ai-sdlc:new-app` | engineers | A new app from `scaffold/`, with the UI shell for its type |
| `/ai-sdlc:update-app` | engineers | Refreshes an app's plugin-owned files (`scripts/managed.json`) on a branch, never its own work |

## How it's split

- **The plugin** holds the workflow: skills, the reviewer, and the scaffold. Updating the plugin updates every app's workflow at once.
- **Each app's repo** holds what runs without Claude: the risk-tier rules and merge gate (GitHub Actions), the main-only deploy guard (Cloudflare Workers Builds), and the session hook. They're written by `/ai-sdlc:new-app` and kept current by `/ai-sdlc:update-app`.

The app stack is Nuxt 4 on Cloudflare Workers, Nuxt UI (dashboard, landing or starter shell), Pinia and Pinia Colada, D1 and KV, and Access or Turnstile. See [scaffold/README.md](scaffold/README.md) and [scaffold/docs/SETUP.md](scaffold/docs/SETUP.md).

## Developing the plugin

```bash
node --test "scripts/test/*.test.mjs"                        # new-app / update-app
cd scaffold && pnpm install && pnpm check                   # the scaffold itself
```

Bump `version` in `.claude-plugin/plugin.json` for every release. Apps record the version that last wrote their files in `.ai-sdlc.json`.

## Verified live (on a test app, 2026-09-24)

- **The merge gate on real PRs:**
  - red PRs are blocked until reviewed, and green ones pass
  - a review only counts for the commit it read
  - it reads `main` as it is at check time, not the PR's stale recorded base
  - branch rules are enforced
- **Deploys:** Workers Builds deploys `main` through the deploy guard (`DEPLOYED_FROM=main` plus the commit), and previews go to a separate Worker with its own database.
- **Sign-in and bot protection:** Cloudflare Access sign-in is verified by the app itself, and Turnstile is checked server-side.
- **A real HR session**, which produced the leave tracker (5 examples).
- **The in-session engineer review** cleared red PRs with no human approval, reviewing the local commit before push, so `ci` ran once.
