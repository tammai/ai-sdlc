# Agent evals

Regression tests for the agent configuration (`CLAUDE.md`, `.claude/**`, skills, hooks) — run like code.

- One file per task: `{ id, prompt, setup?, allowedTools?, maxTurns?, checks: [...] }`.
- Check types: `command` (exit 0), `unchanged` / `changed` / `only_changed` (globs over the diff), `file_contains`, `output_contains` (`negate: true` inverts).
- Start with 20–50 real tasks whose accepted outcome you know. **Every production incident becomes an eval**, written by the incident owner, and stays forever.
- Run locally: `node evals/run.mjs [--filter id]` — uses your `claude` login (subscription is fine), counts against your plan usage. Run it before merging changes to CLAUDE.md, skills or hooks. Optional CI (`/ai-sdlc:setup ci`): `.github/workflows/agent-evals.yml` runs on any change to `CLAUDE.md` / `.claude/**` / `evals/**` and nightly; the pass rate below `config.json#passThreshold` fails the check.
- Each eval runs in a throwaway `git worktree` at HEAD, so your working tree is never touched.
