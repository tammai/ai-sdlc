---
name: plan
description: Stage 3 (Build) gate of the AI-native SDLC — produce a plan.md (files that change, order of work, tests as proof, risks, alternatives, rollback) from the approved spec (or intent for tier S), let the engineer interrogate it, and record approval. Nothing is implemented without an accepted plan; the plan-gate hook enforces it. Use before any implementation, or via /ai-sdlc:plan.
---

# Plan — design review happens before code exists

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`. Run it inline as `node "<that path>" <args>` every time; never put the command in a shell variable (zsh does not word-split `$sdlc`) and never define a shell function (it does not parse in PowerShell).

Work read-only until approval — behave as in plan mode (the guard hook blocks code edits for the active change anyway; only `docs/sdlc/**` is writable).

1. `sdlc draft plan`.
2. Read spec.md (tier S: intent.md), CLAUDE.md, `.sdlc/stack.json`, and the code you'll touch. For more than a handful of files, dispatch the researcher from `sdlc route researcher`, asking specifically for **independence**: which steps touch disjoint files.
3. Write plan.md:
   - **Files that change** — every path, new/edit/delete, one-line why. If you can't name the file, you don't understand the change yet.
   - **Order of work** — small steps, each verifiable on its own. Contract → data/migration → server → client → wiring. Mark steps on disjoint files with ∥ (parallel-worktree candidates).
   - **Tests (proof)** — per AC: which test, which tier (unit / integration / e2e), and the exact command that goes green. UI: screenshot vs mock. Bug: the reproducing test comes first.
   - **Risks** — what could break, blast radius, migrations, rate limits, perf; mitigation for each.
   - **Alternatives considered** — 1–2 lines each.
   - **Rollback** — revert / flag off / down-migration.
4. **Interrogate it with the user** — put the hard questions on the table yourself, don't wait to be asked: what could break? which step is riskiest? what did we not consider? is anything here not in the spec (scope creep)? Iterate until the plan is implementable by someone with no context.
5. Present a compact view (files + steps + top risk) and ask for approval. On yes: `sdlc approve plan --by "<name>"` (tier S: refused while intent.md has unticked open questions; see the **intent** skill). Tier L: the approver should be the tech lead/architect.
6. Commit intent/spec/plan now (`git add docs/sdlc/<id>`, then `git commit -m "plan(<id>): approved"` as a separate command, so it also runs in PowerShell 5.1) so the review stage can diff the code against an approved plan.

Then hand off to the **build** skill.
