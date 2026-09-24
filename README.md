# ai-sdlc

A Claude Code plugin that lets **non-engineers** (HR, marketing, PMs, designers) build and ship small apps with Claude, safely. It follows the [AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook).

People describe a problem, agree on concrete examples, and see screenshots before anything goes live. Every change gets a risk tier:
- **Green** changes ship once the automatic checks pass.
- **Yellow and red** changes first get an independent Claude engineer review.
- Only reviewed code merged to `main` is deployed.

## The loop

<p align="center"><img src="artifacts/loop.svg" width="720" alt="The ai-sdlc loop in the playbook's six stages: idea, shape, build (technical plan, a plan review for yellow and red, implementer, fresh verifier with up to 3 rounds), check, ship (an engineer review for yellow and red, merge gate, main-only deploy guard), and Report a problem, triaged into draft intents that become the next ideas." /></p>

Each of the playbook's six stages is one step, and each step leaves a file behind: the intent, the agreed examples, the technical plan, and the review record. After go-live, "Report a problem" submissions are triaged into draft intents, the next ideas, which closes the loop. The person only decides at three points: whether the idea was written down right, whether the examples are right, and whether the result is what they wanted.

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
4. Replace the starter rules in the app's `POLICIES.md` with your organisation's own, such as personal data, retention and outside services. `/ai-sdlc:shape` checks every idea against them.

**Engineers: keep the loop turning**

| Skill | What it does |
| --- | --- |
| `/ai-sdlc:triage` | Turns new **Report a problem** submissions from the live app into draft intents, one branch each. It reads the live database with one fixed, read-only query. |
| `/ai-sdlc:report` | Per-stage metrics from what the workflow already records. For example: idea to agreed examples, verification passed first time, first `ci` pass, time to merge, review warnings, deploys per week, and changes that came from reports. |
| `/ai-sdlc:learn` | Finds problems that keep coming back (verifier issues, review warnings) and proposes one-line lessons for the app's `LEARNED.md`. `CLAUDE.md` imports that file and the reviewer checks it. Proposals only, until you approve. |

When something goes wrong in production, follow the app's `docs/ROLLBACK.md`. Rollbacks are never done from a Claude session.

**Everyone else: make a change**

Open the app's folder in Claude and go step by step:

| Step | What happens |
| --- | --- |
| `/ai-sdlc:idea` | You describe the problem in your own words. Claude asks at most 5 questions, as pick-lists. |
| `/ai-sdlc:shape` | You agree on 2–5 examples, like "When I …, I see …". Claude checks the idea against your organisation's policies, and notes who has to agree. |
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
- **Review before push is enforced on the author's machine.** The session hook refuses `git push` for a yellow or red commit that has no saved engineer review. A push from outside Claude isn't covered by the hook, but the merge gate still needs a review for the exact commit.
- **Apps can't pin the plugin's version.** Claude Code's project settings can't pin a plugin, so every app uses the release the marketplace points to. The marketplace entry points at a release tag, not at `main`. A new release reaches apps only when the tag is cut and the entry is bumped, and that bump passes this repo's CI and behaviour-eval gate first. What must not drift sits in each app's own repo and changes only through `/ai-sdlc:update-app` and that app's merge gate: the risk rules, the merge gate, the session hook and the deploy guard.
- **Session settings live in the app's repo.** To hold them on every non-engineer's machine regardless, deploy the managed settings in `docs/managed-settings.example.json` (see `docs/SETUP.md`, section 7).
- **Dates default to Vietnamese** (`locale: 'vi-VN'`, `timeZone: 'Asia/Ho_Chi_Minh'`). Change them per app in `app/app.config.ts`.
- **The stack is fixed on purpose.** Requests outside it (other frameworks, databases, payments, mobile apps) go to an engineer.

## Status

Version 0.3.0.

**Verified live on a test app (2026-09-24), before the workflow was packaged as a plugin:**
- **The merge gate on real pull requests.** Red is blocked until reviewed, and green passes. A review counts only for the commit it read. The gate reads `main` as it is at check time. Branch rules are enforced.
- **Deploys.** Workers Builds deploys only `main`, through the deploy guard, and previews go to a separate Worker with its own database.
- **Sign-in.** Cloudflare Access sign-in is verified by the app itself, and Turnstile is checked server-side.
- **A real HR session**, which produced a leave tracker with 5 examples.
- **The in-session engineer review** cleared red pull requests with no human approval. It reviewed the local commit before push, so `ci` ran once.
- **`/ai-sdlc:report`, `/ai-sdlc:triage` and `/ai-sdlc:learn`** on the test app's real pull requests and live database. Triage read the new reports with its one read-only query. Learn found a repeated review warning that led to a fix in `/ai-sdlc:ship`.

**Checked by evals** (see [evals/README.md](evals/README.md)):
- **Scenario evals** replay real incidents against the risk rules and the session hook: deterministic, and run in CI.
- **Behaviour evals** run the skills headless in throwaway apps: an idea becomes an intent; analytics is red; no destructive migration; no deploy from a session; the full build loop builds an agreed intent, and its checks pass.
- CI fails if a skill or agent changed since the behaviour evals last passed.

**Not yet verified:**
- installing the plugin from the marketplace (the evals load it with `--plugin-dir`)
- the install prompt when opening an app
- `/ai-sdlc:update-app` on a real app

## Developing the plugin

```bash
node --test "scripts/test/*.test.mjs"          # new-app, update-app, report, triage, learn
node evals/run-scenarios.mjs                  # risk rules and hook against real incidents
node evals/run-behavior.mjs                   # the skills, headless (uses your Claude plan)
cd scaffold && pnpm install && pnpm check     # the scaffold itself
claude plugin validate .                      # the manifests
```

After changing a skill or agent, run the behaviour evals. When they all pass they record `evals/behavior/last-pass.json`, and CI checks it.

**Releasing.** Work on `main` doesn't reach anyone until it's released:
1. Bump `version` in `.claude-plugin/plugin.json`.
2. Make sure CI is green, including the behaviour-eval gate.
3. Tag it (`git tag v<version> && git push origin v<version>`) and create a GitHub release with the notes.
4. Point `ref` in `.claude-plugin/marketplace.json` at the new tag, and push.

Each app records the version that last wrote its files in `.ai-sdlc.json`, and `/ai-sdlc:update-app` writes an intent describing each update.

## License

[MIT](LICENSE) © 2026 BigIn
