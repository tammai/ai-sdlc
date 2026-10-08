# ai-sdlc

A Claude Code plugin: skills in `skills/`, hooks in `hooks/` and `scripts/`, subagents in `agents/`, app templates in `templates/apps/`. Details for contributors are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Rules
- **No dependencies in `scripts/`.** Hooks and the CLI are plain Node >= 18 with zero npm packages; don't add one.
- **`agents/` is generated.** Edit `agents-src/`, then run `node scripts/build-agents.mjs` (a unit test fails if they drift).
- **Commits are conventional:** `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:` with an optional scope, e.g. `fix(stack): …`. Releases are `chore(release): vX.Y.Z`.
- **`evals/*-hard-*` cases each carry a copy of `evals/_fixtures/app-repo.sh`** as `scaffold.sh` (a case can't reference files outside its folder). Change the fixture, then copy it into each case; a unit test fails if a copy drifts.
- **A new skill needs an eval case tagged `skill-<name>`;** a unit test fails without one. Copy `evals/fix-bug-report/` (prompt + one `tool_used: Skill` grader), rename the folder, and change the prompt, the skill name in the grader, and the `tags:` line in `prompt.md` (it must include the folder name and `skill-<name>`).

## Testing
Entry point is `node test/run.mjs`.
- Before pushing a change to a skill, hook or `scripts/`: `node test/run.mjs` (unit tests, validate, then only the eval cases the change affects).
- Before a release: `node test/run.mjs --full`.
- One unit test file: `node --test test/guard.test.mjs`. Everything free: `node test/run.mjs --no-evals`.
- **On `main` with nothing changed, quick mode runs zero evals and still reports green.** It compares against `origin/main`. Use `--base HEAD~1` to cover your last commit, or `--only <tags>` (e.g. `--only skill-fix,negative`).
- `hook-prod-gate` needs a sandboxed shell and is skipped on Windows; run `node test/run.mjs --only hook-prod-gate` from WSL.
- Evals spend plan usage and run locally on the maintainer's login. Do not add a Claude token or an eval job to CI; CI runs only the free unit job.
