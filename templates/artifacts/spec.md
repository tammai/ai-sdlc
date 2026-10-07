---
id: {{id}}
artifact: spec
status: draft
tier: {{tier}}
author: {{author}}
created: {{created}}
stack:
skills_applied:
approved_by:
approved_at:
---
# Spec: {{title}}
Reads: intent.md. Status: draft.

## Requirements
<!-- Numbered, testable. FR-1 … each with acceptance criteria AC-1.. written as Given/When/Then or examples. -->

## Non-functional requirements
<!-- Performance budgets, availability, accessibility (WCAG 2.1 AA for UI), privacy, observability. -->

## Design
### Stack & placement
<!-- Which stack profile (see .sdlc/stack.json) and where this lives. New stack choice → ADR in docs/sdlc/adr/. -->
### Data model
### API / contract
<!-- Contract-first: OpenAPI paths/schemas, or server routes + Zod/valibot schemas. Breaking changes called out. -->
### UI
<!-- Screens, states (empty / loading / error / success), component-library primitives used. -->
### Rollout
<!-- Feature flag? Migration order? Backfill? Rollback path. -->

## Policies applied
<!-- Each project/org skill or CLAUDE.md rule that constrained this spec and how. -->

## Concerns (resolve before plan)
<!-- Policy conflicts, unsatisfiable constraints, open questions that block. Name the owner who must decide. Empty = none.
     `- [ ] concern — owner: <who>`, ticked `- [x] concern → decision (by <who>)` when resolved; `sdlc approve spec` waits for every box. -->

## Out of scope
