# Building blocks per stack — reach for these before inventing

| Problem | edge-web (Workers) | bff-web + go-api (Postgres) | Clients (Flutter / Tauri) |
|---|---|---|---|
| Auth session | sealed cookie session (nuxt-auth-utils / Better Auth) | BFF cookie session ↔ short-lived JWT to API; JWKS validation | OIDC + PKCE; refresh token in secure storage/keychain; Rust/Dio interceptor refresh |
| Authorization | check in every server route; tenant id from session, never from the request body | service-layer policy functions; `WHERE tenant_id = $1` in every sqlc query (or RLS) | never trust client-side checks |
| Background job | Queues consumer; Cron Triggers | Postgres job table (River) + worker process | push notification → fetch |
| Long multi-step process | Workflows | job chain with persisted state machine | resumable UI with server-owned state |
| Per-entity coordination / counters / rate limit | Durable Object per key | `SELECT … FOR UPDATE`, advisory locks, or token bucket in Postgres; Redis only with an ADR | debounce + server enforcement |
| Cache | KV (TTL, stale tolerated) or Cache API | HTTP caching (ETag) first; in-process LRU; Redis only with an ADR | HTTP cache + local DB |
| File upload | presigned/multipart direct to R2; metadata row in D1 | presigned to S3-compatible store; metadata in Postgres | upload in background with resume |
| Search | D1 FTS5 for small corpora | Postgres full-text / pg_trgm; dedicated engine only with an ADR | server-side search, debounced |
| Events to other systems | Queue producer after commit | transactional outbox table → relay | — |
| Idempotency | idempotency key stored in D1 with result | `idempotency_keys` table, unique constraint, stored response | generate key per user action, retry with same key |
| Webhooks in | verify signature, enqueue, 200 fast | same; store raw payload; idempotent processing | — |
| Realtime | Durable Objects + WebSockets | SSE from Go (simple) / WebSocket; Postgres LISTEN/NOTIFY for fan-in | reconnect with backoff; resync on reconnect |
| Audit trail | append-only table in D1 | append-only `audit_events` (actor, action, entity, id, at, diff) | — |
| Feature flags / kill switch | KV-backed flags | flags table + cache | remote config fetched at start |
| Multi-tenancy | DB per tenant (D1) for isolation/size, or tenant_id column | tenant_id column + RLS/policy; schema-per-tenant only with an ADR | tenant chosen at login |
| Reporting / analytics | export to R2 + external warehouse | read replica or nightly export; never heavy queries on the primary | — |

Anti-patterns to flag in any design: distributed monolith (services sharing a DB), synchronous chains of 3+ services on a user request, dual writes without outbox, cache as source of truth, unbounded queries/fan-out, "we'll add auth later", microservices for a team of < ~10 engineers without a stated reason.
