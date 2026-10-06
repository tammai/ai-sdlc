# App templates — contract every template must meet

Complete, runnable starter apps copied by `sdlc scaffold-app`. Each template is proven by `.github/workflows/templates.yml` (scaffold → install → verify) weekly and on every change under `templates/apps/`.

## Layout
```
templates/apps/<id>/
  template.json        metadata (see below) — not copied
  app/                 copied to the component dir (repo root when it's the only component)
  root/                optional — merged into the repo root (contracts/, docker-compose.yml, shared files); never overwrites existing files
```
Dotfiles that git or npm treat specially are stored with a leading underscore and renamed on copy: `_gitignore` → `.gitignore`, `_env.example` → `.env.example`, `_npmrc` → `.npmrc`, `_golangci.yml` → `.golangci.yml`, `_dockerignore` → `.dockerignore`, `_prettierrc` → `.prettierrc`.

## template.json
```json
{
  "id": "edge-web-nuxt",
  "profile": "edge-web",
  "ui": "vue",
  "title": "Nuxt 4 SPA on Cloudflare Workers — D1 + KV + R2",
  "toolchains": ["node>=22", "pnpm>=10"],
  "install": ["pnpm install --frozen-lockfile"],
  "postInstall": [],
  "verify": [{ "name": "typecheck", "cmd": "pnpm run typecheck" }],
  "dev": "pnpm dev",
  "verified": "2026-10-06"
}
```
`install`/`postInstall`/`verify`/`dev` commands run inside the component dir. `verify` names are prefixed with the component dir name when several components exist (e.g. `web-test`).

## Placeholders (text files only)
- `__APP_NAME__` — kebab-case name (package names, wrangler name, Go module last segment, Tauri identifier tail)
- `__APP_TITLE__` — human title (page title, window title)
- `__APP_SNAKE__` — snake_case (Dart package name, database names)
- `__GO_MODULE__` — Go module path (default `example.com/__APP_NAME__/api`)
- `__API_URL__` — dev URL of the Go API for BFF/clients (default `http://localhost:8080`)

## Every template must
1. Pin dependencies with a committed lockfile (`pnpm-lock.yaml`, `go.sum`, `Cargo.lock`, `pubspec.lock`) and declare `packageManager`/toolchain versions.
2. Define verify commands that exit non-zero on failure, run without prompts, without network services (tests use in-memory/local emulation; Go integration tests that need Postgres skip cleanly when `DATABASE_URL` is unset), and without secrets.
3. Implement the **notes** slice end to end: list + create (`GET/POST /api/notes` or `/v1/notes` per profile), input validation, empty/loading/error states in the UI, at least one server test and one UI/unit test.
4. Follow the stack profile in `skills/stack/references/<ref>.md` (SSR off, auth hooks in place, generated code isolated in the protected paths listed in `skills/stack/profiles.json`).
5. Include `CLAUDE.md` fragment `app/CLAUDE.stack.md` (3–8 lines: commands, layout, rules) that scaffold-app merges into the repo's CLAUDE.md "Stack" section.
6. Contain no secrets, no `node_modules`, no build output, no `.env` (only `.env.example` / `.dev.vars.example`).
