# ai-sdlc

A Claude Code plugin that lets **non-engineers** (HR, marketing, PMs, designers) build and ship small apps with Claude, safely. It follows the [AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook).

People describe a problem, agree on concrete examples, and see screenshots before anything goes live. Every change gets a risk tier:
- **Green** changes ship once the automatic checks pass.
- **Yellow and red** changes first get an independent Claude engineer review.
- Only reviewed code merged to `main` is deployed.

## The loop

<p align="center"><img src="docs/loop.svg" width="720" alt="The ai-sdlc loop in the playbook's six stages: idea, shape, build (technical plan, a plan review for yellow and red, implementer, fresh verifier with up to 3 rounds), check, ship (an engineer review for yellow and red, merge gate, main-only deploy guard), and Report a problem feeding the next idea." /></p>

Each of the playbook's six stages is one step, and each step leaves a file behind: the intent, the agreed examples, the technical plan, and the review record. After go-live, "Report a problem" feeds the next idea, which closes the loop. The person only decides at three points: whether the idea was written down right, whether the examples are right, and whether the result is what they wanted.

## Requirements

- Claude Code: the desktop app (what non-engineers use) or the CLI
- Node 22+, pnpm (`npm i -g pnpm`), git, and the GitHub CLI signed in (`gh auth login`)
- For each app: a GitHub repo and a Cloudflare account (Workers, D1, KV; Access for staff apps)
- **Windows:** keep app folders at a short path, e.g. `C:\Users\<you>\apps\<app>`. Deep paths break `pnpm install`.

## Install

```
/plugin marketplace add tammai/ai-sdlc
/plugin install ai-sdlc@ai-sdlc
```

Apps created with `/ai-sdlc:new-app` also list the plugin in their `.claude/settings.json`, so Claude should offer to install it when someone opens the app.

## Getting started

**Engineers: create an app once**
1. `/ai-sdlc:new-app` asks for the app's type (internal, public or prototype), its data, and a name. It then creates the repo, installs the UI shell for that type (dashboard, landing or starter), and proves it with `pnpm check`.
2. Follow the app's `docs/SETUP.md`: the GitHub ruleset, Cloudflare D1/KV, Access or Turnstile, the two Workers Builds, and the owner's machine.
3. After updating the plugin, run `/ai-sdlc:update-app` in each app. It refreshes the app's plugin-owned files on a branch and never touches the app's own work.

**Everyone else: make a change**

Open the app's folder in Claude and go step by step:

| Step | What happens |
| --- | --- |
| `/ai-sdlc:idea` | You describe the problem in your own words. Claude asks at most 5 questions, as pick-lists. |
| `/ai-sdlc:shape` | You agree on 2–5 examples, like "When I …, I see …". |
| `/ai-sdlc:build` | Claude writes a technical plan, and a reviewer checks it before any code for riskier changes. One subagent builds it, checks first. A fresh subagent then checks the result against what you agreed, up to 3 rounds. |
| `/ai-sdlc:check` | You see a screenshot next to each example: "Is this what you wanted?" |
| `/ai-sdlc:ship` | Yellow and red changes are reviewed on your computer first, then pushed once and merged. Merging deploys. |

Three plugin subagents do the checking. None of them is told what was built or why:
- **`ai-sdlc:engineer-reviewer`** reviews against the app's `REVIEW.md` twice: the technical plan before any code, at `/ai-sdlc:build`, for yellow and red; and the final commit before push, at `/ai-sdlc:ship`.
- **`ai-sdlc:implementer`** builds the change.
- **`ai-sdlc:verifier`** is fresh and read-only every round. It audits the build's diff against the intent, never against the implementer's own account. This is the implement/verify loop from `bigin-skills`' `task-workflow`.

## How it's split

- **The plugin** holds the workflow: the skills, the reviewer, and the app scaffold. Updating the plugin updates these for every app at once.
- **Each app's repo** holds what runs without Claude:
  - the risk-tier rules and the merge gate (GitHub Actions)
  - the main-only deploy guard (Cloudflare Workers Builds)
  - the session hook

  These change only when `/ai-sdlc:update-app` runs, on a branch that ships like any other change. What it owns is listed in [`scripts/managed.json`](scripts/managed.json).

The app stack is Nuxt 4 on Cloudflare Workers, with Nuxt UI, Pinia and Pinia Colada, D1 and KV, and Cloudflare Access or Turnstile. See [scaffold/README.md](scaffold/README.md) and [scaffold/docs/SETUP.md](scaffold/docs/SETUP.md).

## Limits to know

- **The review is a record, not a lock.** The merge gate accepts a posted review for the pull request's current commit, but anyone with write access could post one by hand. The hard protections live elsewhere:
  - the session hook blocks secrets, destructive migrations, deploys and edits to engineer-owned files
  - production refuses anything not deployed from `main`
- **Review findings are warnings, never blockers.** `/ai-sdlc:ship` offers to fix them, and the person decides.
- **Nothing enforces "review before push" yet.** It's an instruction in `/ai-sdlc:ship`. Making the hook refuse `git push` on an unreviewed yellow or red branch is a planned follow-up.
- **Dates default to Vietnamese** (`locale: 'vi-VN'`, `timeZone: 'Asia/Ho_Chi_Minh'`). Change them per app in `app/app.config.ts`.
- **The stack is fixed on purpose.** Requests outside it (other frameworks, databases, payments, mobile apps) go to an engineer.

## Status

Version 0.1.0.

**Verified live on a test app (2026-09-24), before the workflow was packaged as a plugin:**
- **The merge gate on real pull requests.** Red is blocked until reviewed, and green passes. A review counts only for the commit it read. The gate reads `main` as it is at check time. Branch rules are enforced.
- **Deploys.** Workers Builds deploys only `main`, through the deploy guard, and previews go to a separate Worker with its own database.
- **Sign-in.** Cloudflare Access sign-in is verified by the app itself, and Turnstile is checked server-side.
- **A real HR session**, which produced a leave tracker with 5 examples.
- **The in-session engineer review** cleared red pull requests with no human approval. It reviewed the local commit before push, so `ci` ran once.

**Not yet verified:**
- installing the plugin from this repo
- the skills appearing as `/ai-sdlc:…`
- the install prompt when opening an app
- `/ai-sdlc:update-app` on a real app

## Developing the plugin

```bash
node --test "scripts/test/*.test.mjs"          # new-app / update-app
cd scaffold && pnpm install && pnpm check     # the scaffold itself
claude plugin validate .                      # the manifests
```

Bump `version` in `.claude-plugin/plugin.json` for every release. Each app records the version that last wrote its files in `.ai-sdlc.json`.

## License

[MIT](LICENSE) © 2026 BigIn
