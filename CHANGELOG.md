# Changelog

All notable changes to the ai-sdlc plugin. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).
After updating, run `/plugin marketplace update ai-sdlc` then `/plugin update ai-sdlc@ai-sdlc`.

## [0.7.0] — 2026-10-08

### Added
- **Plan approval is a human act.** `approvalGate` in `.sdlc/config.json` (default `["plan"]`) makes the guard pause at the permission prompt for `sdlc approve plan` (flags in any order), for a Write/Edit/MultiEdit that leaves a gated artifact with `status: approved` (judged on the file the edit would produce, not on the edit's text), and for a shell command that writes the artifact. `SDLC_APPROVER=<name>` in the launching shell pre-authorizes and is recorded as the approver; headless runs need it. It applies only in a repo that has set up ai-sdlc, and only to a `plan.md` that can be an artifact (a `PLAN.md` elsewhere is untouched).
- **A prompt hook** (`route-prompt.mjs`, `UserPromptSubmit`) adds a short note to each message in a set-up repo: which skill fits which kind of request, and the active change's next step. A hook cannot call a skill, so Claude still decides. Skipped for `/slash` commands; `routePrompts: false` turns it off.
- **`sdlc verify` is incremental.** It records the git tree it passed on; an unchanged tree finishes at once, and a changed one runs everything or only the checks whose optional `paths` match a changed file. `--force` runs all. Docs, artifacts and top-level notes (`verifyIgnore`) neither mark the change unverified nor trigger a run. The pass is tied to the verify list that produced it, so adding or changing a check runs everything once. `sdlc verify` also says when a check was skipped as known-red only because its tool is missing.
- **`sdlc doctor`** reports whether the hooks fire at all (a hook that cannot start `node` is silent).
- **The Stop gate catches changes made through the shell** (`python3`, `sed -i`, codegen in a Bash call): the prompt hook records the working tree at the start of each turn, and the gate blocks if it differs at the end and was not the last verified tree.
- **Tests for the plugin itself.** `node test/run.mjs` runs unit tests, `claude plugin validate`, and the `claude plugin eval` cases the change affects (`--full` before a release). CI runs the unit tests on Linux, macOS and Windows across Node 18, 20 and 22. See CONTRIBUTING.md.

### Changed
- **The secrets guard covers Grep and Glob and reads shell commands properly.** `.env`, keys and credentials are denied through: a Grep `path`, a directory of secrets, or a `glob` (`.env*`, `*.{env,pem}`, `.[e]nv`, and `*`, which overrides `.gitignore` in ripgrep); quotes, `".e"nv`, `${x:-.env}`, `$HOME`, `$'\x2eenv'`, braces and wildcards in any path segment; `git show HEAD:secrets/db.json`; recursive searches (`grep -r`, `rg -u`, `findstr /s`, `Select-String -Recurse`) over a tree that holds a secret; and, on Windows, `.env.` and `.env::$DATA`. Files under `node_modules` are not secrets. A path or command too long or too intricate to check in time (6 s budget) asks instead of running unchecked.
- **Edits to `.sdlc/config.json` ask only when they would weaken the guard**: a secret or protected path dropped, more allowed, the approval, production, plan or stop gate turned off, the artifacts directory moved, or a file that no longer parses. Everyday edits (`verify`, `formatOnEdit`, presets, added paths) go through. `.sdlc/local/**` and a shell write to either still ask.
- **The default `secretAllow` is narrower**: `.env.example`, `.env.sample`, `.env.template`, `*.example.{json,yaml,yml,toml,txt,md,env}` and `**/node_modules/**`. It was `*.example.*`, which let `api.example.com.pem` through. A saved `secretAllow` is untouched.
- **The guard works in the session project.** When `CLAUDE_PROJECT_DIR` has set up ai-sdlc, every hook uses it as the root, so a shell that has `cd`'d into a nested package does not move the config, state, protected paths and test lock; otherwise the root of the current directory is used, as before. Relative paths in a command resolve against the shell's directory, not the project root.
- **The production gate ignores prose**: a heredoc that edits docs, or a commit message, may say "production" and "deploy". A heredoc that feeds a shell (`bash <<EOF`, `ssh host <<EOF`) is still read.
- **Skills are shell-neutral.** `sdlc` is run inline as `node "<path>" <args>`, `&&` chains are split, and `gh` takes `--body-file`, so they work under zsh and PowerShell. `system-design` also triggers on "what breaks if" and load or size growth questions.
- **Detection**: a Tauri app's `src-tauri` is not also detected as a Rust app (the tests ran three times) and `clippy` denies warnings; verify commands quote directories with spaces; detected PHP and Ruby tests run through `php` and `ruby`.

### Fixed
- **Windows.**
  - A verify or formatter timeout kills the whole process tree, not just `cmd.exe` (eslint and cargo kept file locks).
  - `./gradlew` and similar run as `.\gradlew`.
  - A BOM in `.sdlc/config.json` or an artifact no longer drops its settings.
  - **`nuxt generate` returned `500` on every route** (Nitro compared its `inline` list against Windows paths with backslashes, so Nuxt's runtime stayed external). `bff-web-nuxt`, `edge-web-nuxt`, `spa-web-nuxt`, `site-landing-nuxt` and `site-marketing-nuxt` now set `nitro.externals.inline` with a function matcher; a project scaffolded earlier needs the same line.
  - `media-seed` and the eval runner no longer re-split their arguments at spaces, and the POSIX-only examples have a PowerShell form.
- **The guard failed open on a BOM, a case or link difference, or a secret in the home directory**; a very long or deep path no longer outlasts the 10 s hook limit (which counts as "no objection"); a malformed glob (`[z-a]`, an unbalanced `{`) no longer throws.

### Upgrading
- Run `/plugin marketplace update ai-sdlc`, then `/plugin update ai-sdlc@ai-sdlc`.
- A `formatOnEdit` that already wraps `{file}` in quotes now gets the file quoted twice: remove your quotes (the hook quotes it for the shell it runs in).
- Headless runs (`claude -p`) that approve a plan need `SDLC_APPROVER` set, because the approval now pauses for a person.
- Reading a gated artifact (`plan.md`) with an interpreter or `git` asks, because those can also write; use `cat`, `grep` or `Get-Content`.

### Known limits
- The secrets guard and the approval gate read shell text with regexes, not a shell parser. A command built at run time (`eval`, `$(printf …)`, a variable assembled across statements, `find … -exec cat`, `xargs cat`) can still name a secret file or a plan the guard never sees, and each review round found another route. The lasting fix for approval is to make `sdlc approve` require something only a person has.
- `ssh -i ~/.ssh/id_rsa`, `ls ~/.ssh`, `cp .env.example .env` and `git rm --cached .env` are denied on purpose: they name a secret file or directory. Change `secretPaths` or `secretAllow` per project if you want otherwise.
- A verify check whose tool is missing (for example `make`) is known-red: `sdlc verify` warns but still passes.
- On Windows, keep the project directory under about 100 characters: Node cannot read a `package.json` whose full path is 260 characters or more, even with long paths enabled. Not tested: workerd and Hermes at long paths, the desktop app, `tauri dev` and `tauri build`.

## [0.6.1] — 2026-10-07

### Fixed
- **The Expo production gate never fired.** The `expo` profile's prod patterns were written with single backslashes in `profiles.json` (`"eass+(submit|update)…"`), which JSON reads as a backspace character and a literal `s+`, so the regex could never match `eas submit`. With the Expo stack recorded, `eas submit`, `eas update --branch production` and `eas build --auto-submit` ran without the production prompt. The patterns are now `eas submit` (always a store submission, since the default profile is `production`), `eas update … production` and `eas build … --auto-submit`; checked through the real guard (`ask` for those, no prompt for `eas build --profile preview` or `eas whoami`).
- **`sdlc stack` refuses a profile pattern that can never match** (a control character from a one-backslash JSON escape, or an invalid regex), so a gate cannot go inert silently again.

## [0.6.0] — 2026-10-07

### Added
- **Setup asks for the UI vibe** on a new project, after the stack is recorded and before the scaffold offer (§5c). One call, two questions:
  - **Vibe:** let Claude choose from what the app is (default), or Crisp & technical, Warm & friendly, Editorial & bold. Dark & atmospheric is reached through Other or by inference, never as the default.
  - **Brand anchor:** a colour, font or reference switches to a custom palette on the nearest preset.
- **`skills/uiux/references/vibes.md`**: four presets with concrete seeds (neutrals, accent, radius, type, motion, signature detail), the inference table for "let Claude choose", the custom route and where each template reads its tokens.
- **DESIGN.md gets a `Vibe:` line** (§2). Setup fills DESIGN.md before scaffolding, then lands the tokens in the template's token files and re-runs verify. The `uiux` design contract step skips its feel, accent and typeface questions when the line is there.
- **Static website templates (Nuxt SSG on Cloudflare).** Setup's Apps question has a fourth option, **Website**, and asks which kind:
  - **`site-landing-nuxt`**: a few static pages (home, about, contact, privacy), Nuxt UI, one place for copy and nav, per-page SEO, sitemap, security headers. Served as static assets by an assets-only Worker; a broken internal link fails the build.
  - **`site-marketing-nuxt`**: the landing template plus Nuxt Content 3 (Markdown pages and a blog with build-time-validated frontmatter) and **media in R2**. A small Worker serves `/media/*` (GET/HEAD, ranges, ETag/304, colo cache, SVG sandboxed); every other path is a free static asset. A local R2 is seeded from `media/` for `pnpm dev:worker`.
  - `sdlc stack --surfaces site --site landing|marketing` (a website alone needs no `--backend`; with apps, the app's backend options apply). Sites are Nuxt on both stack choices and stay out of the shared `packages/ui-layer`.
  - **Only what is used ships:** Nuxt UI components are auto-imported (never the whole library); `ui.experimental.componentDetection` generates CSS only for the components rendered (landing 187 → 79 KB, marketing 224 → 119 KB; without it every component's styles ship); icons come from the local `@iconify-json/lucide` with only the used ones bundled (44 icons, 10 KB); the browser never calls the Iconify API; and code highlighting lists its languages.
  - **Drafts are not a flag.** On static hosting the browser downloads the whole content collection, so a `draft: true` flag would leave the post readable in `/__nuxt_content/blog/sql_dump.txt` (verified: title and body were in the dump). Drafts live in `content/blog/drafts/`, which the collection includes only in `nuxt dev` (shown with a Draft badge) and drops from production builds; a test forbids the flag.
  - **SSR exception, recorded per component.** Sites run `ssr: true` with `nuxt generate` (prerendered at build time, nothing renders at runtime). `profiles.json` marks them `render: prerender`, `.sdlc/stack.json` records it on each component, and `templates/apps/SPEC.md` documents the exception and what sites ship instead of the notes slice.
  - New profile reference `skills/stack/references/site-static.md`; CI scaffolds and verifies both templates plus a web + marketing-site combination.

### Changed
- **`scaffold-app` replaces verify entries by command as well as by name.** A preset's `site-test` and a template's `test` run the same command, so they are now one entry; before, a single-component repo ended up with every check twice. This also removes the same duplication for `edge-web` next to other components.
- **`sdlc stack --adr <file>`** links the stack ADR to an already-recorded stack without `--force` (which also reset verify and formatters). The stack skill now creates the ADR with `sdlc adr`.
- **Setup text fixes found by driving it end to end:** it no longer writes the CLAUDE.md "Stack" section by hand when `scaffold-app` is about to merge the template's notes; it passes `--title` so "Kettle & Fern" is not titled "Kettle And Fern"; it says plainly that a new project gets the stack's formatter (existing projects are still asked); it lists the website to-dos (contact address, robots.txt host, `NUXT_PUBLIC_SITE_URL`, R2 buckets) under what still needs a human; and the `Vibe:` line has one format.
- **`vibes.md` Nuxt UI landing is spelled out:** `@theme static` (Tailwind v4 drops unused ramp steps otherwise), the `--ui-primary` lines (Nuxt UI's light primary is step 500, which usually fails contrast with white text), `app.config.ts`, a bundled `@fontsource-variable` font, and updating the favicon and other shipped assets.
- **Fixes from two more end-to-end runs (a landing page, and a marketing site with a picked vibe):** an ADR title with a colon is quoted in the frontmatter (it was invalid YAML) and ADR/change file names are cut at a word boundary; `scaffold-app` drops the template's "Filled from…" placeholder comment from CLAUDE.md; essay and page content in the site templates sits in a `UContainer` (it ran flush to the viewport edge); the marketing blog takes an optional `author`; the "at least one media reference" test no longer forces a sample image; setup says when the formatter is set and what to do with sample copy and content; `vibes.md` now covers tinted neutrals (a paper ramp plus `--ui-bg`), a display face, weights, the brand ramp, and the rule that every `:root` override needs a `.dark` one.
- **Third end-to-end run:** the paper-neutral recipe now gives the lightness of every step and a muted-text contrast check (the previous wording produced a 4.32:1 failure on the Warm canvas), and says the ramp, not the preset seed table, is authoritative; the site home pages tighten Nuxt UI's hero and section padding (about 160px and 128px at desktop) and put the CTA in a container so it no longer touches the viewport edges; the privacy sample text mentions the colour-mode setting in local storage; `dist/` is a protected build path; a display serif as the only family comes with a readability note.
- **Fourth end-to-end run:** `vibes.md` now has the radius as a formula (Nuxt UI uses 1.5× for inputs and buttons, 2× for cards and modals, 3× for the CTA box, of `--ui-radius`; a table gives the value per preset: `0.5rem` for Warm, not `0.75rem`, which gave 18px buttons and a 36px CTA box), the measured role mapping for a custom neutral ramp (and says to confirm a few from computed styles instead of assuming), tinted surfaces via `variant="subtle"`/`"soft"`, a chroma curve for the brand ramp anchored on the brand's own lightness, and when to skip the display-face recipe; the site home CTA is a tinted `subtle` card; setup drops the API question when the request already says website-only, says to delete the Stack block's duplicate "Commands:" line, and keeps the CLAUDE.md header comment; `sdlc stack` prints which formatter it turned on; the templates say "the user's brief" instead of "the intent doc".
- **Site templates keep all sample copy in `app/data/site.ts`** (landing: every page; marketing: the home page), and the dead `prose` classes on the landing pages are gone.

### Notes
- The decision model is borrowed from [Hallmark](https://github.com/nutlope/hallmark) (MIT): tone as a pick, genre before theme, custom only on a brand anchor, ask once and state the inference, locked tokens. Not borrowed: its 21-theme catalog, macrostructures, nav/footer archetypes and hero enrichment, which are landing-page shapes that `anti-slop.md` flags in app UI.
- Existing projects are not asked; their look comes from the code.

## [0.5.0] — 2026-10-07

### Added
- **Definition of ready at the intent → spec boundary.** `sdlc approve spec` (and `approve plan` for tier S) is refused while `intent.md` has unticked open questions or `spec.md` has unticked Concerns. Items use checkboxes: `- [ ] question — owner` → `- [x] question → decision (by who)`. New `sdlc ready`; `sdlc status` shows `open:N`.
- **Reviewer independence for tier L.** `sdlc route` records the model routed as implementer, picks a reviewer on a different model from `crossModelReview.ladder` (default opus > sonnet) and stamps `implemented_by` / `reviewed_by` / `independence` into `review.md`. `approve review` refuses unless it is `cross-model`. `route reviewer --implementer-model <m>` for work done in the main session.
- **Gate levels: off · advisory · soft · hard** for the two new gates (`gates.ready`, `gates.independence`, both `soft` by default). `soft` accepts `--override "<reason>"`, recorded as `<gate>_override` in the artifact. New `sdlc gates [set <gate> <level>]`.

### Notes
- With the default ladder, a tier L review runs on Sonnet/high because the L implementer is Opus. Reorder or extend `crossModelReview.ladder` to change that.
- Borrowed in spirit from the AI-SDLC Framework's Definition-of-Ready gate, cross-harness review and advisory → mandatory gates. Not borrowed: the multi-task orchestrator, DSSE attestations, other agent harnesses.

## [0.4.2] — 2026-10-07

### Changed
- **"Let Claude choose" now asks what the backend needs** before deciding fullstack vs a separate Go API, when the app builds its own backend. The options are payments/multi-tenant/sensitive data, jobs/integrations/reporting, scale or a separate backend team, or a simple app. Claude decides from the answers and records them in the stack ADR. Before, it guessed.

## [0.4.1] — 2026-10-07

### Changed
- **"Let Claude choose" is the first and default stack option** in setup. The team's stack is now the "From templates" option (`--choice templates`, replacing `--choice default`). `sdlc stack` without `--choice` uses Claude's picks.
- **Setup always asks whether the app uses an existing backend API**, on both paths. Before, the "Let Claude choose" path assumed there was none. The answers are:
  - no (build the backend);
  - our own API we can change (new `--backend existing-own`: SPA + passthrough Worker pointed at it, no BFF, no new Go API);
  - an API we don't control (`--backend existing`: BFF).
- **`--api-url`** is recorded in `.sdlc/stack.json` and used by `scaffold-app` for the contract server, the SPA dev proxy and the Worker's local `ORIGIN_URL`.

### Fixed
- **Setup's stack table** had its two choice columns swapped.

## [0.4.0] — 2026-10-07

Stack choice, real auth in the Go API, and no BFF in front of your own API.

### Added
- **Setup asks how to choose the stack:** "Use the default templates" or "Let Claude choose". `sdlc stack --choice default|claude`.
- **Backend option for an existing API.** `--backend existing` maps the web app to `bff-web`, a BFF that keeps that API's tokens or keys server-side.
- **New templates:**
  - `spa-web-nuxt` / `spa-web-react`: a static SPA plus a passthrough Cloudflare Worker that forwards `/api/*` to the Go API, with no logic. Includes sign-in screens driven by `/v1/auth/providers`, a route guard, and OIDC error handling.
  - `edge-web-hono-react`: Vite + React SPA with a Hono API and D1 in one Worker, typed end to end with Hono RPC.
  - `expo`: Expo SDK 57 mobile client.
    - Sign-in methods: password, magic-link deep links, and OIDC with PKCE.
    - Tokens: single-flight refresh with rotation, stored in SecureStore.
    - Also: a sign-up screen.
  - `tauri-vue`: Vite + Vue desktop with file-based routing (Vue Router 5), for desktop-only apps.
- **Shared Nuxt layer.** When a Nuxt web app and a Nuxt desktop app are created together (or desktop is added to an existing Nuxt web app), `scaffold-app` creates `packages/ui-layer` and has the new apps extend it. It never edits an existing app; it prints the one-line `extends` change.
- **Real auth in the `go-api` template**:
  - **Sessions and tokens:** web gets an httpOnly session cookie with CSRF checks (`X-Requested-With` + Origin allow-list). Native gets opaque bearer tokens with refresh rotation, reuse detection and a 90-day absolute cap.
  - **Sign-in methods:**
    - password (argon2id, rehash on login, no account enumeration);
    - optional magic link (log or SMTP);
    - OIDC providers (authorization code + PKCE, state, nonce, browser binding, verified-email linking only).
  - **Native OIDC uses app-side PKCE** (RFC 8252). Production refuses to start with insecure settings.
  - **Notes are scoped per user.** Rate limits send `Retry-After`. Audit log lines never contain tokens.
- **Shared contract v0.3.0** describes the full auth API.
- **New stack profiles and references:** `spa-web` / `web-spa-go.md` and `expo` / `mobile-expo.md`.
- **CI:** 13 template jobs plus a combination job (Nuxt web + Nuxt desktop with the shared layer).

### Changed
- **New separate backend:** now `spa-web` + `go-api` (the Go API owns sessions). It was `bff-web` + `go-api`. A full BFF in front of your own API needs an ADR.
- **Desktop template choice:**
  - `tauri-nuxt` when there's also a Nuxt web app;
  - `tauri-vue` when desktop is the only app;
  - `tauri-react` on Claude's choice.
- **`scaffold-app`:**
  - chooses the UI per component from `.sdlc/stack.json`;
  - adds explicitly named new components to existing projects (into empty folders only);
  - fills placeholders in template commands.
- **Nuxt 4.6 templates require Node ≥ 22.21** (`engines` and `template.json`).
- **The `go-api` test command** is `go test -v ./...`, so CI shows which tests ran or skipped.

### Fixed
- **tauri-vue:** `build.rs` created Nuxt's `.output/public` instead of `dist`. Verify now regenerates typed routes before typecheck.
- **expo:** a test hard-coded the scheme `demo-notes://` instead of the app-name placeholder.
- **Contract:** an unquoted comma split the 202 description in `/v1/auth/magic-link`. Grant fields are documented as camelCase. Native sign-up and OIDC error codes (web and native) are documented.

## [0.3.0] — 2026-10-07

Full app templates for new projects.

### Added
- **`sdlc scaffold-app`.** Creates the app from full templates for the stack recorded in `.sdlc/stack.json`. It:
  - fills in the app name, title, Go module and API URL;
  - copies the shared `contracts/openapi.yaml` and `docker-compose.yml` to the repo root;
  - installs from pinned lockfiles;
  - writes the verify commands;
  - adds each template's notes to the CLAUDE.md "Stack" section (creating CLAUDE.md if missing);
  - runs verify.

  It refuses folders that aren't empty and repos with an existing app.
- **8 templates in `templates/apps/`:** edge-web-nuxt, edge-web-next, bff-web-nuxt, bff-web-next, go-api, tauri-nuxt, tauri-react, flutter. Each ships a working notes feature with tests. The contract is in `templates/apps/SPEC.md`.
- **`.github/workflows/templates.yml`.** Scaffolds and verifies every template weekly and on changes (Linux runners, Postgres service for go-api). It needs no Claude token.

### Changed
- **Setup offers `scaffold-app`** after recording a new stack. The stack references now point to the templates.

### Known limits
- **edge-web-next** `pnpm build` needs symlink support (Linux, macOS, WSL, or Windows Developer Mode).
- **flutter** was written without a local Flutter SDK. CI proves it: `flutter analyze` is clean and all 17 tests pass. Its lockfile is generated on first install.
- **go-api** tests don't use `-race`, which needs cgo. The drift check regenerates and builds rather than diffing against git.

## [0.2.1] — 2026-10-06

Installing on an existing project now keeps its stack.

### Added
- **`sdlc inspect`.** Detects existing apps per folder (Nuxt, Next, Go, Flutter, Tauri, Node, Python, PHP, Ruby, JVM, Rust) and whether each matches a stack profile.
- **`sdlc stack --detect [--format]`.** Records the existing stack instead of choosing a new one, and adds only the presets that fit:
  - protected generated paths, only where those folders exist;
  - production-gate patterns for apps that match a profile;
  - the per-file formatter, only with `--format` and only when the project already uses eslint.
- **`sdlc baseline`.** Runs every verify command once and marks checks that already fail as *known-red*. `sdlc verify` reports known-red checks but doesn't enforce them, so the Stop gate never makes Claude fix a build that was already broken. Re-run it after fixing a check to start enforcing it.

### Changed
- **Verify commands come from the project itself.** `sdlc init` builds them from the project's own scripts with its own package manager (npm, pnpm, yarn, bun), per app folder in monorepos. It never adds scripts that don't exist.
- **Setup handles existing projects.** It runs `inspect` first. For an existing project it confirms what was detected, asks whether to turn the formatter on, then runs `stack --detect` and `baseline`. It no longer asks the new-app questions there.
- **`sdlc stack --surfaces/--components` refuses on a repo that already contains an app**, unless you pass `--force`.

### Fixed
- **README:** it said the hooks only apply after setup. The secrets guard and the production-deploy prompt are active in every session where the plugin is enabled; the README now says so and recommends project-scope installs for trying the plugin out.
- **Stack presets on existing projects** no longer add commands for missing scripts or use the wrong package manager (e.g. `pnpm run typecheck` in an npm project).

## [0.2.0] — 2026-10-06

### Added
- **Setup asks what you're building.** At the end of `/ai-sdlc:setup`, one question picks the apps (web, mobile, desktop) and another picks fullstack or a separated backend.
- **`sdlc stack --surfaces web,mobile,desktop --backend fullstack|separated`.** Maps those answers to stack components the same way every time:
  - **fullstack** → `edge-web`, plus `flutter` and/or `tauri`
  - **separated** → `go-api` with `bff-web`, plus `flutter` and/or `tauri`
  - **desktop only + fullstack** → a local-first Tauri app with no server

  The answers are recorded in `.sdlc/stack.json`.
- **`/ai-sdlc:setup ci`.** Optional GitHub automation: Claude PR review with `@claude` fixes, agent evals, failed-build triage, and the close-the-loop monitor.
  - Authenticates with a subscription token from `claude setup-token`, stored as the `CLAUDE_CODE_OAUTH_TOKEN` secret.
  - An API key works as an alternative.

### Changed
- **Works on a Claude subscription by default — no API key needed.** Setup no longer offers CI options. Review, PR babysitting, build triage, evals and anomaly triage run inside your own Claude Code session.
- **CI workflow templates use the subscription token by default.** Each template keeps a commented `ANTHROPIC_API_KEY` line for API-key users.
- **`sdlc stack` won't overwrite a decided stack.** Changing it needs `--force`, after an approved tier-L change and an ADR.
- **Monorepo folder.** The `edge-web` component defaults to `web/` when it's combined with other apps. It still sits at the repo root when it's the only app.
- **Clearer CLAUDE.md wording** in the Cloudflare stack about which commands need a human: remote D1 migrations, Worker secrets and production deploys.

### Fixed
- **Secrets guard false positive.** Writing text that mentions a secret-like path (e.g. "D1/secrets/deploy") through a shell heredoc is no longer blocked. The guard now:
  - ignores heredoc bodies, PowerShell here-strings and commit messages;
  - blocks folder-style patterns (`secrets/**`, `.ssh/**`) only when the path exists;
  - still blocks distinctive secret files (`.env`, `*.pem`, `id_rsa`) wherever they appear.

## [0.1.0] — 2026-10-06

### Added
- **Built from [The AI-Native SDLC Playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook).** Each stage commits an artifact the next stage reads: intent → (system design / UI design) → spec → plan → build/verify → review → ship → maintain.
- **Skills:**
  - main loop: `vibe`, `setup`, `intent`, `spec`, `plan`, `build`, `fix`, `review`, `ship`
  - design: `system-design`, `architecture`, `uiux`, `stack`
  - ongoing: `triage`, `learn`, `policy`, `status`
- **Hooks:**
  - plan gate: no code edits until `plan.md` is approved
  - test lock during fixes
  - secrets guard and protected generated paths
  - production gate: asks, or denies unless `RELEASE_APPROVAL` is set
  - file formatter on edit
  - verify-before-done Stop gate
  - session resume
- **Subagents routed by risk tier.** One source per role in `agents-src/`, generated into one file per tier:
  - simple → Sonnet / low
  - normal → Sonnet / high
  - complex → Opus / medium

  Roles: implementer, reviewer, researcher, verifier, architect-reviewer, ui-reviewer.
- **`sdlc` CLI:** chain state and approvals, ADR log, stack presets, verify evidence (`verify.md`), playbook metrics, Western Electric anomaly detection (`detect`), model routing (`route`).
- **Stack profiles:**
  - Nuxt/Next on Cloudflare (D1/KV/R2)
  - Nuxt/Next BFF + Go (oapi-codegen, sqlc, goose) + Postgres in Docker
  - Flutter
  - Tauri v2
- **Scaffolds:** `CLAUDE.md`, `REVIEW.md`, `DESIGN.md`, agent eval runner, CI workflows, `/babysit` command, managed-settings reference.
- MIT license.

[0.4.2]: https://github.com/tammai/ai-sdlc/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/tammai/ai-sdlc/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/tammai/ai-sdlc/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/tammai/ai-sdlc/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/tammai/ai-sdlc/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/tammai/ai-sdlc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/tammai/ai-sdlc/releases/tag/v0.1.0
