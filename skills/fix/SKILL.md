---
name: fix
description: Bug-fix flow of the AI-native SDLC — reproduce the bug as a failing test first, confirm it fails for the expected reason, lock the test so it cannot be edited, then fix the code until verify is green. Use for bug reports, failing behavior, regressions, or /ai-sdlc:fix.
argument-hint: "<bug description, error, or issue link>"
---

# Fix — the test exists before the fix

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`.

1. **Intent:** `sdlc new "<bug title>" --fix --tier <S|M|L>`. Fill intent.md briefly: observed vs expected, repro steps, impact, suspected area. Tier by blast radius of the *fix* (data corruption, auth, payments → L). Ask the user to confirm the expected behavior (that's the judgment call), then `sdlc approve intent`.
2. **Reproduce as a test** (allowed before plan approval — fix mode exempts test files from the plan gate): write the smallest test at the lowest level that observes the bug (unit > integration > e2e). Run it. It must **fail, for the expected reason** — read the failure message; a test failing on a typo proves nothing. If you can't reproduce, stop and report what you tried.
3. **Commit the failing test** (`test(<id>): reproduce <bug>`), then `sdlc lock-tests <test-file>`. From now on the guard hook blocks any edit to it.
4. **Plan:** `sdlc draft plan` — root cause (one paragraph, with file:line evidence), files that change, the locked test as proof, risks, and any neighboring cases to add as *new* tests. Tier S: show it inline and get a "yes". `sdlc approve plan`.
5. **Fix:** route via `sdlc route implementer` (tier M/L) or inline (S). Fix the code until the locked test and the full gate pass: `sdlc verify`.
6. `sdlc unlock-tests`. If the bug class could recur (it usually can), propose an eval (`evals/<id>.json` — the playbook's "every incident becomes a permanent eval") and, if Claude caused it twice, a CLAUDE.md line via the **learn** skill.
7. → **review** (M/L) or **ship** (S).

For flaky tests: reproduce the flake first (loop the test N times, record the failure rate), then treat the nondeterminism as the bug.
