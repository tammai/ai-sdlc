# Profile: bff-web (BFF for an existing API) + go-api (contract-first Go API)

> **When the BFF applies:** in front of an **existing API the team doesn't control**. The BFF keeps that API's tokens or keys server-side, owns the browser session and reshapes calls; replace `contracts/openapi.yaml` with that API's spec. For a **new** Go API, there's no BFF: see `web-spa-go.md`, where the API owns sessions and a passthrough Worker makes it same-origin. The Go API sections below apply to `go-api` in both cases.

**Web (BFF):** Nuxt 4 + Nuxt UI (default) or Next.js + shadcn/ui · Tailwind v4 · `ssr: false` · server routes are a thin BFF: session cookie ↔ bearer token, request shaping, no business logic.
**API:** Go (current stable) · OpenAPI 3.1 contract at `contracts/openapi.yaml` · `oapi-codegen` strict server on `chi` · `sqlc` + `pgx/v5` · `goose` migrations · `log/slog` JSON logs · Postgres (current stable) · Docker Compose for local and single-host deploys.

## Layout (monorepo)
```
contracts/openapi.yaml            the contract — changed first, reviewed as an API change
api/
  cmd/server/main.go              wiring only
  internal/api/gen/               oapi-codegen output (protected; `go generate`)
  internal/<module>/              handler.go (implements generated StrictServerInterface) · service.go · repo.go
  internal/db/queries/*.sql       sqlc input
  internal/db/sqlc/               sqlc output (protected)
  migrations/NNNN_*.sql           goose (append-only: never edit an applied migration)
  Dockerfile                      multi-stage → distroless, non-root
web/                              Nuxt/Next BFF; api client generated from the contract (openapi-typescript + openapi-fetch)
docker-compose.yml                postgres + api (+ web for local)
```

## Rules
- **Contract first:** edit `contracts/openapi.yaml` → `go generate ./...` (server types) and regenerate the web/mobile clients → implement. A breaking change (removed field, changed type, new required param) is tier L and needs versioning or a migration path for every client.
- Handlers: decode → validate → call service → map errors to RFC 9457 problem+json. Services hold business rules and transactions (`pgx.Tx` passed explicitly). Repos are sqlc queries only.
- Auth: the BFF owns the browser session (httpOnly, Secure, SameSite=Lax cookie; CSRF token on mutating requests) and forwards a short-lived bearer token; the Go API validates JWT (issuer, audience, expiry, JWKS) on every route except `/healthz`. Authorization checks ownership in the service layer (no IDOR).
- Money: integer minor units or `numeric` → `pgtype.Numeric`; never float. Time: `timestamptz`, UTC.
- Every state-changing endpoint emits an audit log line (actor, action, entity, id). No PII in logs.
- Context deadlines on every DB/HTTP call; graceful shutdown; `/healthz` + `/readyz`.

## Tests & verify
Go: table-driven unit tests for services; integration tests against real Postgres via `testcontainers-go` (no DB mocks for repo code); `go test -race`. `golangci-lint` with errcheck, govet, staticcheck, gosec. Generated-code drift check (`go generate` + `git diff --exit-code`). Web: vitest + Playwright against the compose stack for critical flows.

## Deploy
Images built in CI, tagged with the git SHA. Dev/staging: compose or the platform's staging env (agent may deploy). Production: CI on tag/merge with release approval; `goose up` against prod and image pushes to prod tags are gated. Rollback: previous image tag + down-migration only if the migration was additive-reversible (prefer expand/contract migrations so rollback never needs a down).

## Scaffold
`sdlc scaffold-app` copies the verified template for this profile (`templates/apps/`). The notes below describe how the template was built — use them only when adding this profile's pieces by hand.
`go mod init`, add `oapi-codegen` (as a `go tool` dependency), `sqlc`, `goose`, `chi`, `pgx/v5`; `//go:generate` lines for oapi-codegen and sqlc in `internal/api/gen/gen.go` and `internal/db/gen.go`; `.golangci.yml`; Dockerfile; compose with `postgres` healthcheck. Web: as edge-web but without Cloudflare bindings; `nitro.routeRules` / server routes proxy `/api/**` to the Go API with the session token.

## CLAUDE.md snippet
- Contract-first: contracts/openapi.yaml → `go generate ./...` → regenerate web client → implement. Never edit internal/api/gen, internal/db/sqlc or applied migrations.
- Go: chi + oapi-codegen strict server, sqlc + pgx, goose. Business rules in service.go; repos are sqlc only; problem+json errors.
- BFF holds the session cookie and forwards bearer tokens; no business logic in web/server.
