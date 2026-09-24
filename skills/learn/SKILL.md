---
name: learn
description: "Engineers: find problems that keep coming back in an ai-sdlc app (verifier issues, plan and change review warnings) and propose short lessons for its LEARNED.md, so the next build avoids them and the next review checks them. Proposes first and changes nothing without approval. Use now and then (monthly, say), after a run of rework, or when someone types /ai-sdlc:learn."
---

# /ai-sdlc:learn: turn repeated problems into lessons

The playbook's advice: when the same mistake happens twice, put the fix into the instructions, not into a reviewer's head. In these apps, that's `LEARNED.md`. `CLAUDE.md` imports it, so every session builds with it, and the engineer reviewer checks its **For review** section. `CLAUDE.md` and `REVIEW.md` themselves belong to the plugin and are overwritten by `/ai-sdlc:update-app`, so lessons never go there.

**Engineers only.** `LEARNED.md` is engineer-owned. If the person isn't an engineer, gather and show the findings, but don't write the file.

## Steps

1. **Start clean** on an up-to-date `main`, then gather:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/learn.mjs" . --limit 50
   ```
   It prints every recorded problem, with its source:
   - `verifier`: issues from build logs
   - `plan-review`: plan review warnings
   - `review`: warnings on merged pull requests
   - `review-local`: warnings from this machine, including ones fixed before push

   It also counts them by area of the app.

2. **Find the repeats.** Read `LEARNED.md`, `CLAUDE.md` and `REVIEW.md` first. A lesson is worth proposing only if:
   - the same kind of problem shows up **at least twice** (in different changes, or in different rounds of one)
   - no existing rule already covers it. If a rule exists but was missed, the lesson makes it more specific.
   - it's about **this app**. Anything general, such as a flaw in a skill, the reviewer or the stack's defaults, goes to the ai-sdlc plugin instead: draft an issue for `tammai/ai-sdlc` and show it. Don't file it without asking.

   Ignore one-offs, and warnings about engineer-owned files changed by engineers.

3. **Propose, don't write.** Show each proposed lesson as one line, with the evidence under it (sources and counts), and say where it goes:
   - **For building:** a rule Claude follows while building. For example: "Leave requests: always show dates with `formatDate()`; three verifier rounds failed on UTC dates."
   - **For review:** a check the reviewer applies. For example: "Any route that changes a leave request must check the approver role (PR #8, #10)."

   Also propose **removing** lessons that no longer apply: the code changed, or the problem stopped.

   Then ask with `AskUserQuestion` (multi-select): which lessons to add or remove.

4. **Write the approved ones** into `LEARNED.md` under the right heading, one line each: short, concrete, and naming the file or page. Keep the file under about 40 lines. If it's growing past that, merge lessons or move general ones to the plugin. Then:
   - branch `learn/<YYYY-MM-DD>` from `main`, and commit `Learn: <n> lessons`
   - ship it with `/ai-sdlc:ship`. It's red (engineer-owned file), so it gets the engineer review.

## Don't

- Don't edit `CLAUDE.md`, `REVIEW.md`, skills or agents in the app.
- Don't turn every warning into a rule. Too many lessons get ignored, and repeats are the signal.
