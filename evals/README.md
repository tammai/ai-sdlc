# Evals

The playbook's "continuous evals": they check that the workflow still behaves right whenever the risk rules, the session hook, the skills or `REVIEW.md` change.

| | Command | What it checks | Cost | When |
| --- | --- | --- | --- | --- |
| **Scenario evals** | `node evals/run-scenarios.mjs` | 49 realistic changes and commands, many from real incidents, against the scaffold's risk rules and session hook exactly as they ship. Checks the tier, the rules that fired, and whether the hook blocks. | free, seconds | every push (CI), and every scenario must pass |
| **Behaviour evals** | `node evals/run-behavior.mjs [id…] [--budget 2]` | Realistic requests run through headless Claude Code with this plugin loaded, each in a throwaway app. Graded on what ends up in the repo and the reply: the intent written, the policy check, the tier, no destructive migration, no deploy, and the full build loop (plan, plan review, implementer, fresh verifier) passing typecheck and its example checks. | real Claude usage, minutes (the build loop is about 30) | after changing skills, agents or app instructions, and before a release |

## The gate in CI

Behaviour evals can't run in CI, because they need Claude. Instead, a full passing run writes `behavior/last-pass.json` with a fingerprint of everything Claude follows: `skills/`, `agents/` and the scaffold's `CLAUDE.md`, `REVIEW.md`, `POLICIES.md`, `LEARNED.md` and intent template. CI runs `node evals/fingerprint.mjs --check` and fails if any of them changed since. Commit `last-pass.json` along with the change.

## Adding a scenario

When something goes wrong in a real app (an incident, a surprise tier, a guard that let something through), add it here first, then fix the rule. That's how the corpus grows, and a fixed problem stays fixed.

- **A change** → `scenarios/tiers.json`: `changes` (path + added lines) and `expect` (`tier`, `rules`, `notRules`, `escalated`)
- **A command or edit in a session** → `scenarios/hook.json`: `tool`, `input` and `expect.blocked` (optionally `role: "engineer"`)
- **A request to Claude** → `behavior/scenarios.json`: `prompt`, an optional `setup` (a branch, plus files committed with a message), and graders (`fileMatches`, `noFileMatches`, `fileExists`, `commandPasses`, `branchNot`, `onlyChanged`, `noCommits`, `transcriptMatches`, `riskTierIfChanged`). `budget` and `timeoutMinutes` can be set per scenario.

## Safety of behaviour runs

- Each run gets a fresh clone of a base app. Its `origin` is a local bare repo, so a push can only land in a folder on this machine. The base app is rebuilt whenever the scaffold changes.
- Cloudflare credentials are replaced with an invalid token, so nothing can be deployed, even if a guard failed.
- `--budget` caps each run. Signed in with a claude.ai plan, runs count toward the plan's usage limits (no API credits), and the cap applies to the run's estimated usage. With an API key, it caps real spend.
- Apps live under `~/apps/.ai-sdlc-evals/`. Delete the folder to clean up.
