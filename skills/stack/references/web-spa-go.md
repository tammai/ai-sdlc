# Profile: spa-web + go-api — static SPA, passthrough edge Worker, Go API that owns auth

The default for a **new separate backend**. No BFF: the Go API is the only backend, and it owns accounts and sessions for every client.

```
Browser ──▶ app.example.com   one Cloudflare Worker
              ├─ static SPA   (Nuxt ssr:false + Nuxt UI  |  Vite + React + shadcn/ui)
              └─ /api/*  ──▶  ORIGIN_URL  (prefix stripped; passthrough, no logic)
Mobile / Desktop ──▶ api.example.com ──▶ Go API  (bearer tokens)
Go API (AWS / GCP / DO / any VPS, ideally behind Cloudflare Tunnel) ── Postgres
```

## Rules
- **The Worker never contains business logic.** It serves the SPA's static files and forwards `/api/*` unchanged (method, headers, body, Set-Cookie). Validation, reshaping, auth and aggregation all live in the Go API. A Worker change that does more than routing needs an ADR (it would be a BFF).
- **Contract first:** `contracts/openapi.yaml` → `go generate ./...` in `api/` → `pnpm gen:api` in `web/` (typed client, committed `schema.d.ts`) → implement. Each feature touches the contract, the API and the SPA; there's no BFF layer to keep in sync.
- **Auth (Go API):**
  - Web gets an httpOnly `session` cookie. It's first-party because the Worker makes the API same-origin.
  - Every state-changing request sends `X-Requested-With: fetch`, and the API also checks `Origin` against `ALLOWED_ORIGINS`.
  - Native clients use opaque bearer tokens from `/v1/auth/token`, with refresh rotation.
  - Sign-in methods: password (argon2id), optional magic link, and OIDC providers. The API handles the OIDC flow, so tokens never reach the browser.
- **The SPA** calls only `/api/...` through the generated client with `credentials: 'same-origin'`. It has no tokens in storage and no CORS. It renders sign-in options from `GET /v1/auth/providers`.
- **Local dev:** the SPA dev server proxies `/api` to `http://localhost:8080` and strips the prefix; run Postgres with `docker compose up -d postgres`.

## Deploy
- **SPA + Worker:** `wrangler deploy` (production is human-gated). `ORIGIN_URL` per environment in `wrangler.jsonc`.
- **Go API:** the container image from `api/Dockerfile`, deployed to any host. Production deploys and `goose up` against prod are gated. Prefer Cloudflare Tunnel so the origin isn't publicly reachable.
- **Rollback:** `wrangler rollback` for the web; the previous image tag for the API (expand/contract migrations keep rollbacks safe).

## Scaffold
`sdlc scaffold-app` copies `spa-web-nuxt` (default) or `spa-web-react` together with `go-api`, and the shared `contracts/openapi.yaml` + `docker-compose.yml`.

## CLAUDE.md snippet
- Web: static SPA in `web/` + one Worker that only forwards `/api/*` to the Go API (never add logic there). API: `api/` owns auth, sessions and all business rules.
- Contract-first: `contracts/openapi.yaml` → `go generate` (api) → `pnpm gen:api` (web). Never edit generated code.
- Every state-changing web request sends `X-Requested-With: fetch`; never store tokens in the browser.
