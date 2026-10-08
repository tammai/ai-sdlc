# Contributing

## Testing the plugin
For working on ai-sdlc itself. (The `evals` scaffold in the [README](README.md#scaffolds-sdlc-scaffold-) is a different thing: an eval runner for *your* project.) `node test/run.mjs` is the one entry point:

| Command | Runs | Cost |
|---|---|---|
| `node test/run.mjs --no-evals` | unit tests for the hooks, the CLI and packaging (`test/*.test.mjs`) + `claude plugin validate --strict` | free, seconds |
| `node test/run.mjs` | the above + the `claude plugin eval` cases that cover what you changed vs `origin/main` (committed, staged, unstaged and untracked), 1 run each | plan usage |
| `node test/run.mjs --full` | every eval case, 3 runs each, with and without the plugin to report the delta | plan usage, 6× the runs per case |

- **Flags:** `--only <tags>` picks cases by tag (`hooks`, `guard`, `skill-fix`, `triggering`, `hard`, `outcome`…), `--dry-run` shows what would run, and anything after `--` goes to `claude plugin eval` (e.g. `-- -j 4 --no-publish`).
- **Cases** live in `evals/<case>/`: `prompt.md` + `graders/`, plus `case.yaml` and `scaffold.sh` when the case needs a fixture repo.
  - **Trigger** cases check that a request loads the right skill. The `hard` ones never name a stage and run in a small app repo (`evals/_fixtures/app-repo.sh`, copied into each case because a case can't reference files outside its folder). Their negatives use SDLC vocabulary without asking for a change.
  - **Hook** cases check that a guardrail holds in a real session.
  - **Outcome** cases check what a skill delivers: `ship` stops without a review, `build` won't implement a draft plan under pressure, `fix` writes the reproducing test before the code.
- **Selection:** `test/select.mjs` maps changed paths to tags. Shared code (`lib.mjs`, `sdlc.mjs`, the manifest, `evals/_fixtures/`) and unknown paths run everything.
- **Windows:** Claude Code won't grant a shell tool it can't sandbox, so cases that need Bash (`hook-prod-gate`) are skipped there. Run them on Linux, macOS or in WSL (`node test/run.mjs --only hook-prod-gate`).
- **CI** (`.github/workflows/plugin-tests.yml`) runs only the free unit job (Linux, macOS and Windows × Node 18/20/22; `claude plugin validate` on Node 22), on PRs and pushes to main (except template- or docs-only changes). Evals run locally on your own Claude login, so no token is stored in GitHub: run `node test/run.mjs` before pushing a skill or hook change, and `--full` before a release.
