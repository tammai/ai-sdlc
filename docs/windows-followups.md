# Windows follow-ups

Findings from the cross-platform audit that only matter on Windows, or that could not be checked without a Windows machine. The macOS side and the plugin's own scripts are fixed and green in CI (Linux, macOS, Windows × Node 18/20/22); everything below is open. Work through it on a Windows box, tick items off, delete the file when empty.

Start with **A (verify first)**: those are claims nobody has run. Then fix **B**.

## A. Verify first (unconfirmed, needs a real Windows run)

- [ ] **Hooks find `node`.** (Partly checked: `node` v22 is on PATH in both PowerShell and Git Bash here; still needs a real `claude --debug` run.) Launch Claude Code the way you normally do (desktop app and terminal, PowerShell and Git Bash) and run `claude --debug`. SessionStart/PreToolUse hooks must run `node "…\scripts\guard.mjs"` without exit 127. A missing `node` is non-blocking, so every guard is silently off.
- [ ] **Guard cold start under 10 s** on a first run with Defender scanning (`timeout: 10` in `hooks/hooks.json`). A timeout also fails open.
- [ ] **The PowerShell tool.** In a session, run a few guarded commands through it: `Get-Content $env:USERPROFILE\.aws\credentials` (expect deny), `ri tests\a.test.ts` with a test lock active (deny), `npm.cmd publish` (ask).
- [ ] **`${CLAUDE_PLUGIN_ROOT}` has backslashes and maybe spaces** (`C:\Users\<you>\.claude\plugins\cache\…`). Run `/ai-sdlc:setup` on a project and confirm `node "<path>" inspect` works inline from PowerShell and from Git Bash.
- [ ] **Paths over 260 chars.** The plugin cache prefix is long. Check `git config core.longpaths true` and `LongPathsEnabled`, then scaffold a Nuxt and a Tauri app and look for ENAMETOOLONG.
- [ ] **Trailing-dot/space and stream names reach the same file:** `.env.`, `.env ` and `.env::$DATA` on NTFS. The guard matches `.env.*` but not these. Try `Read` on each (expect deny).
- [ ] **8.3 short names** (`PROGRA~1`, `RUNNER~1`) in a project path: does the guard still resolve it as inside the repo? (`realpathSync.native` should expand them.)
- [ ] **`nuxt generate` on native Windows.** README says every prerendering Nuxt template returned `500` on all routes, even `spa-web-nuxt` from a short path. Cause unknown. Record the Node version and the first stack trace (`NUXT_DEBUG=1 pnpm generate`), then either fix or narrow the README note.
- [ ] **`make`-driven verify** on Windows: `sdlc baseline` reports "tool missing" and marks it red. Confirm what a Windows user sees.

## B. Fix on Windows

Fixed (unit-tested on Windows; delete once A is verified):

1. **Verify commands cmd.exe cannot run.** `sdlc verify`/`baseline` now run commands through `spawnShell`, which turns a leading `./tool` into `tool` on win32 (`./gradlew test` → `gradlew test`, resolved to `.bat`/`.cmd` by cmd), so already-saved configs keep working. The detector now emits `php vendor/bin/phpunit` and `ruby bin/rails test`, which run on every OS.
2. **Argument splitting with `shell: true`.** `media-seed.mjs` runs `node node_modules/wrangler/bin/wrangler.js` with no shell. `templates/evals/run.mjs` sends the prompt on stdin (`claude -p` reads it there) and quotes the remaining arguments on win32.
3. **POSIX-only syntax in docs and comments.** `edge-web-hono-react` (`CLAUDE.stack.md`, `wrangler.jsonc`) and `go-api/dbtest.go` now show the PowerShell form; the three Tauri `CLAUDE.stack.md` files list the two cargo commands separately. The `template.json` verify entries run in cmd and were left as they are.
4. **Timeouts only killed `cmd.exe`.** `spawnShell` (`scripts/lib.mjs`) runs timed commands under a small node runner that does `taskkill /T /F` on timeout. Used by the formatter hook (20 s) and verify/baseline (15 min).
5. **Guard gaps.** A quoted path with a space is now checked as one path (`tokens()` keeps quoted strings whole). `Grep` is in the hook matcher; the guard denies a secret `path` or a `glob` naming a secret file.
6. **Evals on Windows.** `CONTRIBUTING.md` now says the scaffolded cases need Git Bash ahead of WSL's `bash.exe` on the PATH. They are not skipped automatically.
7. **README Requirements.** A Windows line lists `core.longpaths`, Docker Desktop or WSL, Rust + MSVC + WebView2, and the Flutter SDK. Tauri `clippy`/`cargo test` still run only on Linux CI, so Windows and macOS Tauri builds are unverified.

Still open:

- `Grep` with a *directory* `path` can still match `.env` contents (`Glob` lists names only and is not guarded).
- `spawnShell`'s tree kill and the `./tool` rewrite are covered by tests, but the `claude -p` stdin path in `templates/evals/run.mjs` has only been run once by hand, not through the eval runner.
- The scaffolded evals have not been run on Windows with Git Bash (they spend plan usage).

## How to confirm a fix

- `node test/run.mjs --no-evals` (unit tests + `claude plugin validate`); add a test in `test/portability.test.mjs` for every guard change.
- Evals are not part of CI. They spend plan usage and need a shell tool, so run them from WSL: `node test/run.mjs` (changed areas) before pushing a hook or script change, `--full` before a release.
- `node --test test/*.test.mjs` runs only the free unit tests, and works from PowerShell on Node 21+ (older Node: use Git Bash so the glob expands).
