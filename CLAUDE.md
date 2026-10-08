# ai-sdlc

A Claude Code plugin: skills in `skills/`, hooks in `hooks/` and `scripts/`, subagents in `agents/`, app templates in `templates/apps/`. Hooks and the CLI have zero dependencies (Node >= 18).

## Testing the plugin
Details are in [CONTRIBUTING.md](CONTRIBUTING.md). Entry point is `node test/run.mjs`.
- Before pushing a change to a skill, hook or `scripts/`: `node test/run.mjs` (unit tests, validate, and only the eval cases the change affects).
- Before a release: `node test/run.mjs --full`.
- `hook-prod-gate` needs a sandboxed shell and is skipped on Windows; run `node test/run.mjs --only hook-prod-gate` from WSL.
- Evals spend plan usage and run locally on the maintainer's login. Do not add a Claude token or an eval job to CI; CI runs only the free unit job.
- `evals/system-design-hard-uploads` fails until the `system-design` skill description catches indirect "what breaks if…" questions.

## Rules
- `agents/` is generated. Edit `agents-src/`, then run `node scripts/build-agents.mjs` (a unit test fails if they drift).
- Cases in `evals/*-hard-*` each carry a copy of `evals/_fixtures/app-repo.sh` as `scaffold.sh`; change the fixture, then copy it into each case.
- Every new skill needs eval cases tagged `skill-<name>` (see `test/select.test.mjs` for the tags the selector expects).
