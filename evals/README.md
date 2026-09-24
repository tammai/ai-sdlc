# Evals

The playbook's "continuous evals": they check that the workflow still behaves right whenever the risk rules, the session hook, the skills or `REVIEW.md` change.

| | Command | What it checks | Cost | When |
| --- | --- | --- | --- | --- |
| **Scenario evals** | `node evals/run-scenarios.mjs` | 41 realistic changes and commands, many from real incidents, against the scaffold's risk rules and session hook exactly as they ship. Checks the tier, the rules that fired, and whether the hook blocks. | free, seconds | every push (CI), and every scenario must pass |
| **Behaviour evals** | `node evals/run-behavior.mjs [id…] [--budget 2]` | Realistic requests run through headless Claude Code with this plugin loaded, each in a throwaway app. Graded on what ends up in the repo: the intent written, the tier, no destructive migration, no deploy. | real Claude usage, minutes | on demand: after changing skills, and before a release |

## Adding a scenario

When something goes wrong in a real app (an incident, a surprise tier, a guard that let something through), add it here first, then fix the rule. That's how the corpus grows, and a fixed problem stays fixed.

- **A change** → `scenarios/tiers.json`: `changes` (path + added lines) and `expect` (`tier`, `rules`, `notRules`, `escalated`)
- **A command or edit in a session** → `scenarios/hook.json`: `tool`, `input` and `expect.blocked` (optionally `role: "engineer"`)
- **A request to Claude** → `behavior/scenarios.json`: `prompt` plus graders (`fileMatches`, `noFileMatches`, `branchNot`, `onlyChanged`, `noCommits`, `transcriptMatches`, `riskTierIfChanged`)

## Safety of behaviour runs

- Each run gets a fresh clone of a base app, with **no git remote**, so nothing can be pushed.
- Cloudflare credentials are replaced with an invalid token, so nothing can be deployed, even if a guard failed.
- `--budget` caps each run's spend.
- Apps live under `~/apps/.ai-sdlc-evals/`. Delete the folder to clean up.
