---
name: spec
description: Stage 2 (Design) of the AI-native SDLC — collapse requirements and design into one spec.md for an approved intent, applying the project's stack profile, CLAUDE.md conventions and policy skills while writing (not after), and flagging policy conflicts as Concerns. Use for tier M/L changes after intent approval, or via /ai-sdlc:spec.
---

# Spec — requirements and design in one session

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`. Run it inline as `node "<that path>" <args>` every time; never put the command in a shell variable (zsh does not word-split `$sdlc`) and never define a shell function (it does not parse in PowerShell). Tier S skips this stage.

Preconditions: intent approved (`sdlc status`). If not, go back to the **intent** skill.

1. `sdlc draft spec` → creates `spec.md` for the active change.
   If `design.md` and/or `ui.md` exist and are approved, they are inputs, not drafts: copy components, contracts, data model and UI screens/states from them instead of re-deciding. The CLI refuses `approve spec` for tier L until design.md is approved, and for any change with a ui.md until it is approved.
2. **Load the policy context first** — that's what makes this stage worth having:
   - `.sdlc/stack.json` + the matching profile in `${CLAUDE_PLUGIN_ROOT}/skills/stack/references/` (if the repo has no stack yet → run the **stack** skill now).
   - `CLAUDE.md`, `REVIEW.md`, and every skill in `.claude/skills/` whose description matches this change (security, API design, brand, UX, compliance…). List the ones you applied in the frontmatter `skills_applied:` and in "Policies applied".
3. **Research where it lands** — dispatch the researcher at the change's tier: `sdlc route researcher` → use that `agent` as the subagent type. Ask it the intent's Problem + Outcome; keep its conclusion, not its file dumps.
4. **Write the spec** following the template:
   - Requirements as `FR-n` with acceptance criteria `AC-n` that a test can observe. Every AC must be checkable by someone who didn't write it.
   - Non-functional: perf budget, a11y (WCAG 2.1 AA for UI), privacy, observability (what's logged/metric'd).
   - Design: placement in the stack profile; data model; **contract first** (OpenAPI path + schemas for Go APIs, typed server routes + schema validation for Nuxt/Next server routes); UI states (empty/loading/error/success); rollout + rollback.
   - A choice the stack profile doesn't cover (new datastore, queue, framework) → **architecture** skill (`sdlc adr "<decision>"`), and the change becomes tier L (→ **system-design** first).
   - UI: new/redesigned screens without a ui.md → run the **uiux** skill (mode B) first for M/L; for small UI additions, apply DESIGN.md + `uiux/references/craft-rules.md` and list the states per screen here.
5. **Concerns** — anything you could not satisfy, contradicting policies, or open questions that block design, as `- [ ] concern — owner: <who>`. Work these first with the user; don't bury them, and tick each with its decision (`- [x] concern → decision (by <who>)`). **Definition of ready:** `sdlc approve spec` refuses while any intent.md open question or spec.md Concern is unticked (`sdlc ready` lists them). Under the default `soft` gate the user can accept the risk with `--override "<reason>"`, which is recorded in spec.md; under `hard` there is no override.
6. Present: requirement list (titles only), key design decisions, Concerns. Ask: does this solve the intent's stated problem? On approval: `sdlc approve spec --by "<name>"`. Tier L: note that a tech lead should approve (`--by "<tech lead>"`).

Changes to spec.md after the plan exists count as rework (a lagging metric) — get it right here, keep it short.
