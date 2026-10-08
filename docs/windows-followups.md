# Windows follow-ups

Findings from the cross-platform audit that only matter on Windows, or that could not be checked without a Windows machine. The macOS side and the plugin's own scripts are fixed and green in CI (Linux, macOS, Windows × Node 18/20/22); everything below is open. Work through it on a Windows box, tick items off, delete the file when empty.

Start with **A (verify first)**: those are claims nobody has run. Then fix **B**.

## A. Verify first (unconfirmed, needs a real Windows run)

- [ ] **Hooks find `node`.** Launch Claude Code the way you normally do (desktop app and terminal, PowerShell and Git Bash) and run `claude --debug`. SessionStart/PreToolUse hooks must run `node "…\scripts\guard.mjs"` without exit 127. A missing `node` is non-blocking, so every guard is silently off.
- [ ] **Guard cold start under 10 s** on a first run with Defender scanning (`timeout: 10` in `hooks/hooks.json`). A timeout also fails open.
- [ ] **The PowerShell tool.** In a session, run a few guarded commands through it: `Get-Content $env:USERPROFILE\.aws\credentials` (expect deny), `ri tests\a.test.ts` with a test lock active (deny), `npm.cmd publish` (ask).
- [ ] **`${CLAUDE_PLUGIN_ROOT}` has backslashes and maybe spaces** (`C:\Users\<you>\.claude\plugins\cache\…`). Run `/ai-sdlc:setup` on a project and confirm `node "<path>" inspect` works inline from PowerShell and from Git Bash.
- [ ] **Paths over 260 chars.** The plugin cache prefix is long. Check `git config core.longpaths true` and `LongPathsEnabled`, then scaffold a Nuxt and a Tauri app and look for ENAMETOOLONG.
- [ ] **Trailing-dot/space and stream names reach the same file:** `.env.`, `.env ` and `.env::$DATA` on NTFS. The guard matches `.env.*` but not these. Try `Read` on each (expect deny).
- [ ] **8.3 short names** (`PROGRA~1`, `RUNNER~1`) in a project path: does the guard still resolve it as inside the repo? (`realpathSync.native` should expand them.)
- [ ] **`nuxt generate` on native Windows.** README says every prerendering Nuxt template returned `500` on all routes, even `spa-web-nuxt` from a short path. Cause unknown. Record the Node version and the first stack trace (`NUXT_DEBUG=1 pnpm generate`), then either fix or narrow the README note.
- [ ] **`make`-driven verify** on Windows: `sdlc baseline` reports "tool missing" and marks it red. Confirm what a Windows user sees.

## B. Fix on Windows

1. **Verify commands cmd.exe cannot run** — `scripts/detect.mjs:122-127`: `./gradlew test`, `./mvnw test`, `vendor/bin/phpunit`, `bin/rails test`. They run through `spawnSync(cmd, { shell: true })` (cmd.exe), where `./x` and forward-slash executables fail. The commands are saved in the committed `.sdlc/config.json`, so detecting per platform would bake in one OS. Options: a wrapper (`sdlc run <tool>` that resolves `gradlew`/`gradlew.bat`), or a documented per-OS override in the config.
2. **Argument splitting with `shell: true`** (Node joins args with spaces, no quoting):
   - `templates/apps/site-marketing-nuxt/app/scripts/media-seed.mjs:36`, `--content-type 'text/plain; charset=utf-8'` and any media path with a space. Fix: quote per argument on win32, or run `node_modules/wrangler/bin/wrangler.js` with `shell: false`.
   - `templates/evals/run.mjs:65`, `spawnSync('claude', ['-p', ev.prompt, …], { shell: win32 })`. A multi-word prompt is split, so `claude -p` gets one word. Fix: resolve `claude.cmd` and avoid the shell, or quote every arg.
3. **POSIX-only syntax in instructions Claude or the user will run by hand:**
   - `templates/apps/edge-web-hono-react/app/CLAUDE.stack.md:7` and `wrangler.jsonc:31`: `CLOUDFLARE_ENV=staging pnpm build && …`. Write as two steps and add the `$env:CLOUDFLARE_ENV='staging'` form, or use `cross-env`.
   - `templates/apps/go-api/app/internal/db/dbtest/dbtest.go:21`: comment `DATABASE_URL=… go test ./...`; add the PowerShell form.
   - `templates/apps/tauri-nuxt` and `tauri-react` `CLAUDE.stack.md:1`: `cd src-tauri && cargo clippy … && cargo test` fails in PowerShell 5.1 (`&&` needs 7+). The `template.json` verify entries are fine (they run in cmd). Reword the doc line as separate steps.
4. **Timeouts only kill `cmd.exe`** — `scripts/post-edit.mjs:25` (20 s formatter) and `scripts/sdlc.mjs:270,314` (verify/baseline, 15 min). The grandchild (eslint, cargo) survives and holds file locks. Fix: `taskkill /T /F /PID` on win32 after a timeout, or spawn detached and kill the tree.
5. **Guard gaps:**
   - A quoted Windows path with a space (`"C:\Users\Jane Doe\.aws\credentials"`) is split on the quote, so the existence check fails (`scripts/guard.mjs`, `tokens()`).
   - The hook matcher has no `Grep`/`Glob`, so `Grep` with a `.env` path leaks it (all platforms; found in this audit, not Windows-specific).
6. **Evals on Windows** — `test/run.mjs` skips only cases whose `allowed_tools` include Bash/PowerShell (`hook-prod-gate`). The other 18 use `evals/*/scaffold.sh` (`#!/usr/bin/env bash`). Without Git Bash, or with `C:\Windows\System32\bash.exe` (WSL) shadowing it, they fail or behave differently. Either skip every scaffolded case on win32 or document the Git Bash requirement. `CONTRIBUTING.md` currently says only `hook-prod-gate` is affected.
7. **README Requirements** (line 19) omits what Windows users need: Docker Desktop or WSL for the Go API's Postgres compose, Rust with the MSVC build tools and WebView2 for Tauri, the Flutter SDK, `gh`, `wrangler`, and `git config core.longpaths true`. Tauri `clippy`/`cargo test` run only on Linux CI, so Windows and macOS Tauri builds are unverified.

## How to confirm a fix

- `node test/run.mjs --no-evals` (unit tests + `claude plugin validate`); add a test in `test/portability.test.mjs` for every guard change.
- Evals are not part of CI. They spend plan usage and need a shell tool, so run them from WSL: `node test/run.mjs` (changed areas) before pushing a hook or script change, `--full` before a release.
- `node --test test/*.test.mjs` runs only the free unit tests, and works from PowerShell on Node 21+ (older Node: use Git Bash so the glob expands).
