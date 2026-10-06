# Stack limits — design drivers

Order-of-magnitude figures for capacity checks. **Platform limits change: before a design depends on a number (anything over ~50% of it), confirm it in the vendor's current docs and cite the link in design.md.** Plan names (free / paid) matter on Cloudflare.

## Cloudflare (edge-web)
| Resource | Limit to design against | Design consequence |
|---|---|---|
| Worker CPU time per request | ms-scale by default on paid plans, configurable up to minutes; free plan is tiny | CPU-heavy work (image processing, big exports, reports) → Queues consumer or Workflows, not the request path |
| Worker memory | ~128 MB per isolate | stream large bodies (R2, CSV); never buffer whole files |
| Subrequests per invocation | capped (free ≪ paid) | fan-out over many items → batch or Queue |
| Request body size | plan-dependent (~100 MB on lower plans) | large uploads → direct-to-R2 presigned/multipart |
| D1 database size | ~10 GB per database (paid) | design per-tenant or per-domain DBs early if data could exceed it; or move to bff-web + Postgres |
| D1 write concurrency | single primary per DB, writes serialized; read replicas available | sustained high write rates or long transactions → batch writes (`db.batch`), queue them, or Postgres |
| D1 query shape | SQLite semantics; no stored procedures, limited ALTER TABLE | migrations via create-copy-swap for complex changes |
| KV | eventually consistent (global propagation up to ~60 s); ~1 write/s per key | KV is a cache/config store, never a counter or source of truth for read-after-write |
| R2 | object size up to TBs via multipart; strongly consistent reads after write | store keys in D1; serve via signed URLs or a Worker |
| Durable Objects | one instance per id, single-threaded, strongly consistent storage | the tool for per-entity coordination (rate limits, counters, rooms, locks) on edge-web |
| Queues | at-least-once delivery, batched consumers, retries + DLQ | consumers must be idempotent |
| Cron Triggers / Workflows | scheduled + durable multi-step execution | long-running orchestration on edge-web |

Outgrowing edge-web (any one is enough): second client needs the same API with versioning discipline; transactional domain with row locks across many tables; sustained writes beyond a single SQLite primary; heavy analytics/reporting; data > ~10 GB in one logical DB; on-prem requirement → bff-web + go-api (ADR).

## Go API + Postgres (bff-web + go-api)
| Resource | Rule of thumb | Design consequence |
|---|---|---|
| Postgres connections | each backend process costs memory; practical direct limit ~100s | pgx pool sized per instance (≈ 2–4 × cores); PgBouncer (transaction mode) beyond a few instances |
| Single primary writes | thousands of simple writes/s on modest hardware; less with heavy indexes/triggers | hot rows (counters, inventory) → avoid single-row contention: sharded counters, `SELECT … FOR UPDATE SKIP LOCKED` queues, or batching |
| Table growth | fine to ~100s of millions of rows with correct indexes | time-series/event tables → partition by time from day one; define retention |
| Long transactions | block vacuum, hold locks | keep transactions short; never call external services inside one |
| Migrations on big tables | `ALTER … ADD COLUMN` with default is cheap on modern PG; index builds lock writes | `CREATE INDEX CONCURRENTLY`; expand → backfill in batches → contract |
| Go service | one instance handles thousands of RPS for I/O-bound JSON | scale horizontally behind the BFF; stateless; context deadlines on every call |
| Background jobs | — | Postgres-backed queue (e.g. River) before introducing a broker; broker only with an ADR |
| Docker single host | fine for early stage | SPOF — document RTO; backups + restore drill (pg_dump/WAL archiving) before launch |

## Flutter (mobile)
| Concern | Rule | Design consequence |
|---|---|---|
| Network | flaky, high latency, metered | paginate (cursor), compress, cache with ETags; never chatty N+1 calls from a screen |
| Offline | expected on mobile | decide per feature: online-only (show offline state), read cache, or offline writes (drift + sync queue + conflict policy — tier L) |
| Releases | store review, users on old versions for months | API must stay backward compatible ≥ N-2 app versions; force-update path; feature flags |
| Background work | OS-restricted | server pushes (FCM/APNs) instead of polling |

## Tauri (desktop)
| Concern | Rule | Design consequence |
|---|---|---|
| Trust | webview is untrusted | business logic, secrets, network and fs in Rust commands |
| Local data | SQLite in app data dir | migrations shipped with the app; backups/export; sync is a tier-L design (conflicts!) |
| Updates | signed updater, users may skip | API compatibility window as for mobile; migrations must handle skipped versions |
| Platforms | Windows/macOS/Linux differ | test matrix in CI; OS keychain differences; code signing per OS |
