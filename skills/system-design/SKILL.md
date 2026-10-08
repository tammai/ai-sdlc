---
name: system-design
description: Design the system for a change before its spec — requirements and NFRs with numbers, back-of-envelope capacity checked against the stack's real limits (Workers/D1/KV/R2, Go/Postgres, Flutter, Tauri), components and boundaries, data ownership, contracts, consistency, failure modes, security, observability and the evolution path — in design.md, then an adversarial architecture review. Required for tier L, available for any change. Use when asked how to architect something, whether it will scale or hold up, or what breaks when load, file size, data volume or user count grows ("how should we architect X", "design a system for", "will this scale", "what breaks if…", "can we handle 10x"), and for a new service, store, queue, integration or data flow; or /ai-sdlc:system-design.
argument-hint: "[what to design, or empty for the active change]"
---

# System design — decide the shape before the spec

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`. References live in `${CLAUDE_PLUGIN_ROOT}/skills/system-design/references/`.

When: **tier L always** (the chain requires an approved `design.md` before `spec` can be approved), and for M changes that add a service, a store, a queue, an integration or a cross-surface contract. A screen or an endpoint inside an existing module doesn't need this — say so and go to the spec.

## 0. Inputs
Approved `intent.md` (no intent → **intent** skill first; for a pure "how would we architect X" question with no change, write design.md under a new change with `--no-activate`). `.sdlc/stack.json` + its reference (no stack → **stack** skill). Existing ADRs: `sdlc adr` lists them — the design must respect them or explicitly supersede one.

## 1. Research the ground truth
`sdlc route researcher` (tier L → `researcher-complex`): current modules, data model, contracts, traffic hints (logs/metrics/configs), and which existing pieces this touches. Keep the conclusion only.

## 2. Draft — `sdlc draft design`
Fill `design.md` top to bottom. Discipline per section:
- **Requirements**: only the ones that shape architecture; every NFR has a number. Unknown number → state the assumption and flag it as a question; never leave "fast" or "scalable".
- **Capacity**: show the arithmetic (users → DAU → peak RPS with a 3–10× peak factor → rows/day → storage/yr). Put each result next to its limit from `references/stack-limits.md`. Any quantity over ~50% of a limit is a design driver — name it.
- **Components**: the minimum that meets the requirements. Each extra component (queue, cache, service, store) must cite the requirement or limit that forces it. Draw it in Mermaid; label arrows with protocol and sync/async.
- **Data**: one writer per entity. Pick stores by access pattern, not fashion. Expand → migrate → contract for every schema change on live data.
- **Consistency**: name the transaction boundaries. Anything spanning two stores or a store + a message gets an outbox or idempotent consumer. State every place users can observe staleness and for how long.
- **Failure modes**: at minimum — each external dependency down/slow, the primary store unavailable, a retry storm, a bad deploy, a poison message (if async). Each row: detection, user impact, degradation, recovery.
- **Security**: draw trust boundaries; every crossing has authN + authZ; tokens never reachable from browser JS/webview/mobile plain storage; tenant isolation is enforced in the data layer, not only the UI.
- **Evolution**: what breaks first at 10×, the next step and its trigger. That trigger also goes into the stack ADR's "Revisit when".
Use `references/patterns.md` for proven building blocks per stack before inventing one.

## 3. Decisions → ADRs
Every one-way door (store choice, sync vs async boundary, tenancy model, new service, public contract shape, a new stack component) gets an ADR via the **architecture** skill (`sdlc adr "<decision>"`). List them in design.md frontmatter `adrs:` and §12. Reversible choices stay inline.

## 4. Adversarial review
`sdlc route architect-reviewer` → dispatch it with the change id and the absolute path of `references/stack-limits.md`. Don't send your reasoning — fresh context is the point. Then:
- Critical → change the design (or, if you disagree, write the counter-argument; the user decides).
- Record findings + resolutions in §"Design review"; residual risks name who accepted them.
- RETHINK → redo §3 with the reviewer's strongest alternative considered explicitly. Max 2 review rounds, then the user decides.

## 5. Approve
Present: the diagram, the 3 biggest drivers (from capacity/NFRs), key decisions + ADR links, top residual risk. Tier L approval belongs to a tech lead/architect: `sdlc approve design --by "<name>"`, and mark the ADRs `accepted` (architecture skill). Then → **spec** (it inherits components, contracts and data model from design.md instead of re-deciding them).

Optional: if Anthropic's `engineering:system-design` skill is installed, you may consult it for a second framing — this skill's artifact and gates stay authoritative.
