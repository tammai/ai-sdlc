---
name: build
description: Stage 3–4 (Build + Test) of the AI-native SDLC — implement an approved plan.md through a tier-routed implementer subagent (sonnet/low for S, sonnet/high for M, opus/medium for L), optionally in parallel worktrees, with a self-verifying feedback loop (sdlc verify → verify.md evidence) and an independent verifier before anything reaches a human. Use after plan approval, or via /ai-sdlc:build.
---

# Build — plan approved, now auto-mode with a feedback loop

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`. Run it inline as `node "<that path>" <args>` every time; never put the command in a shell variable (zsh does not word-split `$sdlc`) and never define a shell function (it does not parse in PowerShell).

Preconditions: `sdlc status` shows `plan:approved` for the active change. If not → **plan** skill. (The guard hook blocks edits otherwise.)

## 1. Route
`sdlc route implementer verifier` → JSON with the subagent type, model and effort for this change's tier, plus the absolute `sdlc` command. Routing also records which model implements the change, which is how the review stage later proves the reviewer is independent. Routing policy:

| Change tier | Complexity | Subagents run on |
|---|---|---|
| S | simple | sonnet / low effort |
| M | normal | sonnet / high effort |
| L | complex | opus / medium effort |

Bump a single step with `sdlc route implementer --complexity complex` when it touches auth, money, migrations or concurrency even inside an M change. Never route a step *down* below the change's tier.

## 2. Implement
- **Sequential (default):** dispatch the routed implementer with: the change id, the absolute `sdlc` command, "implement plan.md in order; run verify after each testable step; record deviations; report". Tier S may be done inline in the main session instead — it's faster than a subagent for a 2-file change.
- **Parallel (≥2 steps marked ∥, disjoint files):** one implementer per step group with `isolation: "worktree"` (or the user runs `claude --worktree <name>` per group). Start with 2–3. Steps that share files stay sequential. Merge worktrees back in plan order, then run the full gate once more.
- Keep the main session as the steerer: read reports, not diffs; intervene when a report says "blocked by plan error" (→ fix plan.md, re-approve with `sdlc reopen plan` + `sdlc approve plan`).

## 3. Feedback loop (non-negotiable)
- `sdlc verify` runs every configured build/lint/test command and writes `docs/sdlc/<id>/verify.md`. Iterate until `VERIFY: all green`. The Stop hook blocks ending the turn while edits are unverified.
- A failing test means fix the code. Never skip, delete, or loosen a test or a lint rule to get green; if a test is genuinely wrong, say so and ask the user.
- UI work: take screenshots of the changed screen (browser/screenshot tool if available) and compare with the mock/spec — 2–3 rounds.
- Plan departures: the implementer appends to plan.md `## Deviations` in the same commit. Check `git diff --stat` against "Files that change" yourself.

## 4. Independent verification (tier M/L)
Dispatch `ai-sdlc:verifier` with the change id. It runs the app, exercises each AC plus neighboring flows, and reports PASS/FAIL. FAIL → back to step 2 with its findings. You don't report done on the implementer's word.

## 5. Hand-off
Tell the user in ≤8 lines: what was built, verify summary (attempts, first-pass or not), verifier verdict, deviations. Then → **review** skill (M/L) or **ship** skill (S).
