# Windows follow-ups

Findings from the cross-platform audit that only matter on Windows, or that could not be checked without a Windows machine. The macOS side and the plugin's own scripts are fixed and green in CI (Linux, macOS, Windows × Node 18/20/22). **A** is still open: claims nobody has run. **B** has been fixed in code (see below), with the exceptions listed under "Still open". Work through it on a Windows box, tick items off, delete the file when empty.

Start with **A (verify first)**.

## A. Verify first (unconfirmed, needs a real Windows run)

- [ ] **Hooks find `node`.** (Partly checked: `node --version` works from both the PowerShell tool and Git Bash here, v22; still needs a real `claude --debug` run.) Launch Claude Code the way you normally do (desktop app and terminal, PowerShell and Git Bash) and run `claude --debug`. SessionStart/PreToolUse hooks must run `node "…\scripts\guard.mjs"` without exit 127. A missing `node` is non-blocking, so every guard is silently off.
- [ ] **Guard cold start under 10 s** on a first run with Defender scanning (`timeout: 10` in `hooks/hooks.json`). A timeout also fails open. (Measured here: about 0.26 s per run once warm, so there is a wide margin. A true first run on a fresh machine is not measured.)
- [ ] **The PowerShell tool.** In a session, run a few guarded commands through it: `Get-Content $env:USERPROFILE\.aws\credentials` (expect deny), `ri tests\a.test.ts` with a test lock active (deny), `npm.cmd publish` (ask).
- [x] **`${CLAUDE_PLUGIN_ROOT}` has backslashes and maybe spaces** (`C:\Users\<you>\.claude\plugins\cache\…`). Checked with a copy of `scripts/` under `…\plugin root with spaces\`: `node "<path>\guard.mjs"` and `sdlc.mjs help` run from both the PowerShell tool and Git Bash. Not checked through a real `${CLAUDE_PLUGIN_ROOT}` expansion or `/ai-sdlc:setup`.
- [ ] **Paths over 260 chars.** The plugin cache prefix is long. Here `LongPathsEnabled` is `1` but `git config core.longpaths` is unset (so git can still fail on long paths). Set it, then scaffold a Nuxt and a Tauri app and look for ENAMETOOLONG.
- [x] **Trailing-dot/space and stream names reach the same file** (`.env.`, `.env `, `.env:x`, `.env::$DATA`). `.env ` and `.env:x` were allowed on `Read`; `.env.` and `.env::$DATA` were already denied. Fixed: the guard now reduces each name with `ntfsPath` (`scripts/lib.mjs`) before matching, with unit tests (the guard test runs on win32 only).
- [x] **8.3 short names** (`PROGRA~1`, `RUNNER~1`) in a project path. Checked with `A-LONG~1` for a long temp directory: `Read .env` and a protected-path `Write` are denied whether the cwd and file path are long, short or mixed. (Not added as a test: it needs 8.3 generation, which can be off per volume.)
- [ ] **`nuxt generate` on native Windows.** README says every prerendering Nuxt template returned `500` on all routes, even `spa-web-nuxt` from a short path. Cause unknown. Record the Node version and the first stack trace (`NUXT_DEBUG=1 pnpm generate`), then either fix or narrow the README note.
- [x] **`make`-driven verify** on Windows without `make`. Seen: `sdlc baseline` prints `RED make (make test) — tool or script missing` with cmd's "'make' is not recognized" text, marks it `baseline: red`, and later `sdlc verify` prints `KNOWN-RED` and `VERIFY: green — 1 known-red baseline check(s) not enforced`. So a project whose only check is `make` is "green" without anything having run. Decide whether a *missing tool* should be known-red (not enforced) or a hard failure.

## B. Fix on Windows

Fixed in code, with unit tests that ran on Windows unless noted (delete once A is verified):

1. **Verify commands cmd.exe cannot run.** `sdlc verify`/`baseline` now run commands through `spawnShell`, which turns a leading `./tool` into `.\tool` on win32 (`./gradlew test` → `.\gradlew test`, resolved to `.bat`/`.cmd` by cmd; a test runs a real `foo.bat` through cmd). It must be `.\tool`, not `tool`: this machine sets `NoDefaultCurrentDirectoryInExePath`, so cmd does not search the current directory. Saved bare `vendor/bin/phpunit` and `bin/rails` entries (the `/` is parsed as a switch in cmd, and neither runs by path) are rewritten to `php vendor/bin/phpunit` / `ruby bin/rails` at run time, and the detector emits those forms now. Not run against real PHP or Ruby projects: the rewrite is a string transform with unit tests.
2. **Argument splitting with `shell: true`.** `media-seed.mjs` runs `node node_modules/wrangler/bin/wrangler.js` with no shell (`bin/wrangler.js` is the bin path in wrangler 4 per `npm view`; the script itself has not been run). `templates/evals/run.mjs` sends the prompt on stdin (`claude -p` reads it there; checked once by hand) and quotes the remaining arguments on win32.
3. **POSIX-only syntax in docs and comments.** `edge-web-hono-react` (`CLAUDE.stack.md`, `wrangler.jsonc`) and `go-api/dbtest.go` now show the PowerShell form; the three Tauri `CLAUDE.stack.md` files list the two cargo commands separately. The `template.json` verify entries run in cmd and were left as they are.
4. **Timeouts only killed `cmd.exe`.** `spawnShell` (`scripts/lib.mjs`) runs timed commands under a small node runner that does `taskkill /T /F` on timeout. Used by the formatter hook (20 s) and verify/baseline (15 min).
5. **Guard gaps.** A quoted path with a space is now checked as one path (`tokens()` keeps quoted strings whole). `Grep` is in the hook matcher; the guard denies a secret file or a directory of secrets (`~/.ssh`, `~/.aws`, `secrets/`) as `path`, and a `glob` that matches secret file names (`.env*`, `*.{env,pem}`) without also matching ordinary source files. A content-mode Grep over a directory (or no path) is denied while `git ls-files -co --exclude-standard` shows a secret file under it, after the glob is applied; a gitignored `.env` is not listed, as ripgrep skips it too. `files_with_matches` (names only) is allowed.
6. **Evals on Windows.** `CONTRIBUTING.md` now says the scaffolded cases need Git Bash ahead of WSL's `bash.exe` on the PATH. They are not skipped automatically.
7. **README Requirements.** A Windows line lists `core.longpaths`, Docker Desktop or WSL, Rust + MSVC + WebView2, and the Flutter SDK. Tauri `clippy`/`cargo test` still run only on Linux CI, so Windows and macOS Tauri builds are unverified.

Still open:

- A content-mode `Grep` can still reach secrets the git check does not see: a directory outside the repo that is not itself a secret directory (a parent of `~/.ssh`), a repo that is not a git repo, and any case where Claude Code's Grep does not honour `.gitignore` (the git check assumes it does like ripgrep; unconfirmed). `Glob` lists names only and is not guarded.
- The `claude -p` stdin path in `templates/evals/run.mjs` has been run once by hand, not through the eval runner; `media-seed.mjs` has not been run.
- The scaffolded evals have not been run on Windows with Git Bash (they spend plan usage).

## How to confirm a fix

- `node test/run.mjs --no-evals` (unit tests + `claude plugin validate`); add a test in `test/portability.test.mjs` for every guard change.
- Evals are not part of CI. They spend plan usage and need a shell tool, so run them from WSL: `node test/run.mjs` (changed areas) before pushing a hook or script change, `--full` before a release.
- `node --test test/*.test.mjs` runs only the free unit tests, and works from PowerShell on Node 21+ (older Node: use Git Bash so the glob expands).
