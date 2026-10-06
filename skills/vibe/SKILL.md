---
name: vibe
description: Main entry point for vibe coding on the AI-native SDLC. Takes an idea ("build X", "add Y", "I want an app that…") or resumes the active change, sizes its risk tier, and drives it through intent → spec → plan → build/verify → review → ship with a human checkpoint at each judgment point. Use for any new feature or app request in a repo using ai-sdlc, or when the user says "continue", "next step", or /ai-sdlc:vibe.
argument-hint: "[idea, or empty to resume]"
---

# Vibe — the loop

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`.

Speed comes from collapsing handoffs, not from skipping judgment. You generate and verify; the human approves intent, spec and plan, and owns review and release. Keep each checkpoint to one short message the user can answer with "yes" or a correction.

## 0. Orient
- If `.sdlc/config.json` is missing → run the **setup** skill first (it takes a minute), then come back.
- `sdlc status`. If the user gave no idea and a change is active, resume at its "next" step. If the user gave a new idea while another change is active, ask whether to park it (`sdlc deactivate`) or finish it first.
- If the repo has no app yet → setup §5b records the stack, then `sdlc scaffold-app` creates it from the verified templates before the first feature.

## 1. Size the tier (decide, then state it in one line)
| Tier | Signals | Chain |
|------|---------|-------|
| **S** | ≤ ~3 files, no schema/contract/auth/payments change, trivially reversible (copy, styling, small bugfix, config) | intent → plan → build/verify → PR |
| **M** | a normal feature: new screen/endpoint/table, contained to one service | intent → spec → plan → build/verify → review → PR |
| **L** | auth, payments, PII, migrations that transform rows, public/breaking API, cross-service, new stack | full chain incl. system design (design.md), all review passes, approvals named as tech lead, ADRs for one-way doors |
Bug report instead of feature → hand over to the **fix** skill.

## 2. Run the stages
Follow each stage's skill. After each artifact, show the user a ≤10-line summary plus "approve / change X", and only then run `sdlc approve <stage>`:
1. **intent** skill → `intent.md` → user approves (`sdlc approve intent`).
2. Design, when it applies (both can run; each is its own approval):
   - **system-design** skill → `design.md` + ADRs (via **architecture**) → architecture review → approve. *Required for tier L; for M when adding a service, store, queue, integration or cross-surface contract.*
   - **uiux** skill (mode B) → `ui.md`: 2–3 directions, user picks, screens/states/copy → approve. *For M/L changes with new or redesigned screens; first UI work in a repo also creates DESIGN.md.*
   - **spec** skill (M, L) → `spec.md` built on design.md/ui.md → resolve Concerns → user approves.
3. **plan** skill → `plan.md` → user interrogates → approve. *The plan gate hook blocks code edits until this is approved.*
4. **build** skill → implement, `sdlc verify` until green, verifier subagent for M/L.
5. **review** skill (M, L) → independent reviewer subagent → fix Important findings → user approves review.
6. **ship** skill → commit chain + code, PR, babysit to green. Production is a human gate.
7. `sdlc close shipped --pr <url>`.

## 3. Momentum rules
- Approvals the user already gave in chat count: "looks good, go" after you showed the plan = approve. Record it with `--by "<their name>"`.
- Don't ask questions you can answer from the repo; use the **researcher** subagent for anything that needs more than ~3 file reads.
- Independent plan steps (marked ∥) can go to parallel worktrees (`claude --worktree <name>`); suggest it when there are ≥2 and the user has review capacity.
- If the user says "just do it" on a tier S change, collapse: write intent + plan in one message, get one "yes", build.
- If the user insists on skipping the plan for M/L: say once what's at risk, then respect their call via `sdlc deactivate` (plan gate off) — never silently.
- Two mistakes of the same kind in a session → **learn** skill writes it into CLAUDE.md before you continue.
