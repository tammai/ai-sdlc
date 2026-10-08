# Windows follow-ups

Findings from the cross-platform audit that only matter on Windows, or that could not be checked without a Windows machine. The macOS side and the plugin's own scripts are fixed and green in CI (Linux, macOS, Windows × Node 18/20/22). Most items below were checked on a Windows 11 machine (Node 22.23, `LongPathsEnabled=1`); what is left is listed under "Still open". Delete the file when it is empty.

## A. Verified on Windows

- [x] **Hooks run under a real session.** `claude -p --plugin-dir <repo>` in a throwaway project with a `.env` and `secrets/deploy`: `Read .env` and PowerShell `Get-Content secrets\deploy` were both denied by the ai-sdlc hook (so `node` was found, and the PowerShell tool is guarded), a plain `Read` worked, and neither canary string reached the output. Not run through the desktop app, or with `claude --debug` from Git Bash.
- [ ] **Guard cold start under 10 s** on a first run with Defender scanning (`timeout: 10` in `hooks/hooks.json`). A timeout also fails open. Measured here: about 0.26 s per run once warm, so the margin is wide. A true first run on a fresh machine is not measured. (Pathological inputs that could exceed 10 s are now capped; see B5.)
- [x] **`${CLAUDE_PLUGIN_ROOT}` has backslashes and maybe spaces.** `node "<path>\guard.mjs"` and `sdlc.mjs help` run from a copy of `scripts/` under a directory with spaces, from both PowerShell and Git Bash, and the real plugin ran in the session above. Not checked through `/ai-sdlc:setup`.
- [x] **Paths over 260 characters.** Installing the Nuxt and Tauri templates works at any project path length tried (216 and 248 characters), so ENAMETOOLONG is not the failure. What fails is Node reading a `package.json` whose full path is 260 characters or more, even with `LongPathsEnabled=1`: `vitest` and `nuxt generate` fail at a 216-character project root (`ERR_PACKAGE_IMPORT_NOT_DEFINED` / "Loading @nuxt/vite-builder builder failed"). The app directory needs to be under about 100 characters. Git fails near 200 characters of project root, and `core.longpaths=true` did not help in that case (not tested for long paths inside a short root). The plugin cache prefix is not the problem. `cargo check` passes for `tauri-nuxt`; `clippy` and `cargo test` were not run. README updated.
- [x] **Trailing-dot/space and stream names reach the same file** (`.env.`, `.env `, `.env:x`, `.env::$DATA`). `.env ` and `.env:x` were allowed on `Read`. Fixed: the guard reduces each name with `ntfsPath` before matching.
- [x] **8.3 short names** (`PROGRA~1`). `Read .env` and a protected-path `Write` are denied whether the cwd and file path are long, short or mixed. Not a test: 8.3 generation can be off per volume.
- [x] **`nuxt generate` on native Windows.** Cause found and fixed; see B8.
- [x] **`make`-driven verify** without `make`: `sdlc baseline` marks it `RED … tool or script missing`, and `sdlc verify` then reported "VERIFY: green". It now also prints a per-check note and `WARNING: n check(s) could not run because their tool is missing`; the result is still green (a missing tool is known-red, not a failure). Decide whether it should fail instead.

## B. Fixed in code

Unit tests ran on Windows unless noted.

1. **Verify commands cmd.exe cannot run.** `sdlc verify`/`baseline` run commands through `spawnShell`, which turns a leading `./tool` into `.\tool` on win32 (a test runs a real `foo.bat` through cmd). It must be `.\tool`, not `tool`: this machine sets `NoDefaultCurrentDirectoryInExePath`, so cmd does not search the current directory. Saved bare `vendor/bin/phpunit` and `bin/rails` entries are rewritten to `php …` / `ruby …`, and the detector emits those forms. Not run against real PHP or Ruby projects.
2. **Argument splitting with `shell: true`.** `media-seed.mjs` runs `node node_modules/wrangler/bin/wrangler.js` with no shell (`bin/wrangler.js` is the bin path in wrangler 4; the script has not been run). `templates/evals/run.mjs` sends the prompt on stdin (checked once by hand) and quotes the other arguments on win32.
3. **POSIX-only syntax in docs and comments** now has the PowerShell form (`edge-web-hono-react`, `go-api/dbtest.go`) or is split into separate commands (the three Tauri templates).
4. **Timeouts only killed `cmd.exe`.** `spawnShell` runs timed commands under a node runner that does `taskkill /T /F` on timeout (formatter hook, verify/baseline).
5. **Guard.** An adversarial review of `scripts/guard.mjs` found bypasses, each reproduced and now covered by `test/guard-hardening.test.mjs` (11 of its tests failed against the old guard):
   - The agent could empty `secretPaths` by editing `.sdlc/config.json` or `.sdlc/local/**`; those edits (and shell commands that write them) now ask a person.
   - Shell scanning missed `.en""v`, `".en"+"v"`, `.e\nv`, `${x:-.env}`, `.e*`, `.[e]nv`, `.env{,}`, `$(…)` inside an unquoted heredoc / `-m "…"` / here-string, `"<<X"` inside quotes, `"$HOME"/.aws/credentials`, `git show HEAD:.env`, `cat secrets/*`, `cd ~/.aws && cat credentials` and `grep -r` over a tree holding a `.env`.
   - File tools outside the repo only checked the file name, so `~/.aws/credentials` and `~/.ssh/*` passed; they now match every trailing sub-path, and `\\localhost\C$\…` maps to its drive.
   - Grep: `Grep` and `Glob` are in the hook matcher; a secret `path`, a glob that matches secret file names (including `[…]` classes and space-separated lists), and a content-mode search over a directory holding a non-ignored secret (git list, or a bounded walk when git is unavailable or the directory is outside the repo) are denied.
   - A command over 20000 characters or a glob with many braces asks instead of risking the 10 s hook timeout (which fails open); a malformed `[z-a]` class no longer throws.
   - `*.example.*` allowed `api.example.com.pem`; it now allows only config-like extensions.
   - A quoted path with a space is checked as one path.
6. **Evals on Windows.** `CONTRIBUTING.md` says the scaffolded cases need Git Bash ahead of WSL's `bash.exe`. Not skipped automatically.
7. **README Requirements.** A Windows line lists Docker Desktop or WSL, Rust + MSVC + WebView2 and the Flutter SDK, and a short project directory. Tauri `clippy`/`cargo test` run only on Linux CI, so Windows and macOS Tauri builds are unverified.
8. **`nuxt generate` returned 500 on every route.** Nitro 2.13 compares its `inline` list against resolved ids that have backslashes on Windows, so the string matchers (`nuxt/dist`, `@nuxt/`) never matched and Nuxt's own runtime stayed external in the prerender build; `nuxt/internal/precomputed` then resolved to the empty export stub ("Either manifest or precomputed data must be provided"). Not a path-length, Defender or lock problem (it fails identically from a 4-character root). Fix: `nitro.externals.inline` with a function matcher in the `nuxt.config.ts` of `spa-web-nuxt`, `bff-web-nuxt`, `site-landing-nuxt`, `site-marketing-nuxt` and `edge-web-nuxt`. Scaffolded fresh from the working tree: `spa-web-nuxt` (7 routes) and `site-landing-nuxt` (12 routes) build and prerender, and `pnpm run build` exits 0. `tauri-nuxt` (Nuxt 4.4.8) was never affected.

## Still open

- **Shell scanning is a heuristic.** The guard reads a command with regexes, not a shell parser. The variants above are closed, but a determined obfuscation (`eval`, `base64 -d | sh`, a variable assembled across statements) can still name a secret file. `Glob` lists names only and is not guarded.
- **Grep and `.gitignore`.** The content-Grep check assumes Claude Code's Grep skips gitignored files like ripgrep; unconfirmed. `grep -r` is checked against all files, ignored or not.
- **Nested projects.** A nested `.git` or `.sdlc` in the cwd (a submodule or package) moves the project root, so the parent's custom `secretPaths` are not applied. Not changed: it needs a decision about monorepos.
- **Not run:** `bff-web-nuxt`, `site-marketing-nuxt` and `edge-web-nuxt` builds with the Nitro fix; `media-seed.mjs`; Tauri `clippy` and `cargo test` on Windows; workerd and Hermes at long paths; the desktop app and `claude --debug` from Git Bash.
- **A missing tool is known-red, not a failure** (see A). The scaffolded evals have not been run on Windows with Git Bash; `hook-prod-gate` runs only on Linux, macOS or WSL (it passed under WSL 2 after `claude update`, `claude auth login`, `apt install bubblewrap socat` and a temporary `HOME`; see CONTRIBUTING.md).

## How to confirm a fix

- `node test/run.mjs --no-evals` (unit tests + `claude plugin validate`); add a test in `test/portability.test.mjs` or `test/guard-hardening.test.mjs` for every guard change.
- Evals are not part of CI. They spend plan usage and need a shell tool: `node test/run.mjs` (changed areas) before pushing a hook or script change, `--full` before a release; `hook-prod-gate` from WSL.
- `node --test test/*.test.mjs` runs only the free unit tests, and works from PowerShell on Node 21+ (older Node: use Git Bash so the glob expands).
