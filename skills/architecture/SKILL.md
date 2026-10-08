---
name: architecture
description: Create, evaluate, accept or supersede Architecture Decision Records (ADRs) in docs/sdlc/adr/ — for one-way-door choices like a datastore, sync vs async boundary, tenancy model, new service or framework, public contract shape, auth approach, or a deviation from the stack profile. Compares options on a fixed matrix, gets an adversarial review, and keeps the decision log consistent. Use for "should we use X or Y", "write an ADR", "document this decision", "review this architecture choice", or /ai-sdlc:architecture.
argument-hint: "[decision to make, or an ADR number to review]"
---

# Architecture — decisions that are expensive to reverse, written down

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`. Run it inline as `node "<that path>" <args>` every time; never put the command in a shell variable (zsh does not word-split `$sdlc`) and never define a shell function (it does not parse in PowerShell).

**Needs an ADR:** choosing or replacing a datastore, queue, framework or hosting; adding a service or splitting one; sync↔async boundary; tenancy/isolation model; auth/identity approach; public or cross-client API shape and versioning; anything that deviates from `.sdlc/stack.json`; accepting a known risk on a tier-L change.
**Doesn't:** library choices behind an interface, internal refactors, reversible config. Say so and move on.

## Create
1. `sdlc adr` lists existing ADRs — read the related ones. A new decision that contradicts an accepted ADR must supersede it (`--supersedes NNNN`), not silently ignore it.
2. `sdlc adr "<decision as a question or verb phrase>"` → `docs/sdlc/adr/NNNN-<slug>.md` (linked to the active change).
3. Fill it:
   - **Context** — forces with numbers (load, data size, team, budget, deadlines, compliance) and the stack profile's default. If the default works, the ADR is short and says so.
   - **Options** — 2–4 real options, always including "the stack default / do nothing". Score each row of the matrix in words (not stars): fit, complexity/ops, cost, familiarity, headroom, reversibility, lock-in. For research-heavy options, dispatch `sdlc route researcher` to gather facts (current limits, pricing, maturity) — cite sources.
   - **Decision** — "We will …", naming the deciding factors. Prefer the boring option unless a requirement forces otherwise.
   - **Consequences** — including the negative ones you're accepting, and follow-up tasks.
   - **Revisit when** — concrete triggers.
   - Frontmatter: `reversibility: one-way | costly | cheap`, `deciders:`.
4. **Review** (one-way and costly): dispatch `sdlc route architect-reviewer` with the ADR path. Fold real findings in; record disagreements in Consequences.
5. Present the decision + top trade-off; the user (tech lead for tier L) decides. On accept: `sdlc adr --accept NNNN --by "<name>"`; on reject: `sdlc adr --reject NNNN --reason "<why>"` — rejected ADRs stay, they stop the same debate next quarter.

## Evaluate an existing decision or proposal
Read the ADR (or the user's proposal → draft it as an ADR first), dispatch the architect-reviewer, and report: verdict, the strongest objection, what evidence would change the decision. Don't rewrite an accepted ADR — propose a superseding one.

## Keep the log healthy
- Statuses: proposed → accepted | rejected; accepted → superseded (by NNNN) | deprecated.
- design.md §12 and spec.md reference ADRs by number; CLAUDE.md "Architecture" lists only the accepted ones that change how code is written (one line each).
- When a review or incident shows an ADR's "Revisit when" triggered, open an intent (`source: review|incident`) to revisit it.

Optional: if Anthropic's `engineering:architecture` skill is installed, it can offer a second framing; the ADR in docs/sdlc/adr stays the record.
