---
id: {{id}}
artifact: design
status: draft
tier: {{tier}}
author: {{author}}
created: {{created}}
adrs:
approved_by:
approved_at:
---
# System design: {{title}}
Reads: intent.md, .sdlc/stack.json. Status: draft. Feeds: spec.md.

## 1. Requirements that shape the design
<!-- Functional (the 3–7 that matter architecturally) + NFRs with numbers: latency p95, availability, durability, RPO/RTO, data residency, compliance. -->

## 2. Load & capacity (back-of-envelope)
<!-- Users, DAU, peak RPS (read/write), payload sizes, data growth/yr, fan-out. Show the arithmetic. Compare each against the stack limits (references/stack-limits.md). -->
| Quantity | Estimate | Math | Limit it must fit | Headroom |
|---|---|---|---|---|

## 3. Components & boundaries
```mermaid
flowchart LR
  %% clients → edge/BFF → services → stores; label each arrow with protocol + sync/async
```
<!-- One line per component: responsibility, owner, why it's separate (or why it isn't). -->

## 4. Data
<!-- Entities + ownership (exactly one writer per entity), store per entity, keys/indexes for the top queries, retention, PII classification, migration strategy (expand → migrate → contract). -->

## 5. Interfaces & contracts
<!-- APIs (OpenAPI paths), events/queues (schema, ordering, delivery semantics), idempotency keys, versioning. Breaking changes and how each client migrates. -->

## 6. Key flows
<!-- The 2–3 flows that carry the risk, as sequence diagrams or numbered steps, incl. the failure branch. -->

## 7. Consistency, concurrency & transactions
<!-- Transaction boundaries, isolation, locking/optimistic concurrency, read-after-write needs, eventual-consistency windows users can observe, outbox/saga where state spans stores. -->

## 8. Failure modes
| Failure | Detection | User impact | Mitigation / degradation | Recovery |
|---|---|---|---|---|

## 9. Security & privacy
<!-- Trust boundaries, authN/authZ per boundary, secrets, tenant isolation, PII flows, abuse cases (rate limits, enumeration), audit events. -->

## 10. Observability & operations
<!-- SLIs/SLOs, metrics and logs per component, alerts (feeds .sdlc/bands.json), runbooks, deploy & rollback, cost drivers. -->

## 11. Evolution
<!-- What breaks first at 10× load, the next architecture step and its trigger, reversible vs one-way-door decisions (one-way doors get an ADR). -->

## 12. Alternatives & decisions
<!-- Each significant choice: options, decision, link to ADR (docs/sdlc/adr/NNNN-*.md). -->

## Design review
<!-- Filled from the architecture reviewer: findings, resolution, residual risks accepted by whom. -->
