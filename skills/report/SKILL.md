---
name: report
description: "Show how an ai-sdlc app's delivery is going, stage by stage: time from idea to agreed examples, first-time verification passes, first ci passes, time to merge, review warnings, deploys per week, and how many changes came from problem reports. Read-only. Use when someone asks how the workflow is going, for metrics, or types /ai-sdlc:report."
---

# /ai-sdlc:report: how delivery is going

The playbook asks for a metric at each stage, so you can see where work slows down or goes wrong. This skill reads what the workflow already records. It doesn't collect anything new, and it changes nothing.

## Steps

1. **Run it** in the app's folder (it needs `gh` signed in to the app's repo):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/report.mjs" . --limit 50
   ```
   It covers the last 50 merged pull requests. If the person asked for a shorter period, lower `--limit`.

2. **Show the table**, then explain it in 3–5 plain sentences. Lead with what stands out, and name one thing to try:
   - **Idea → examples agreed** is slow: people are unsure what they want. Suggest more concrete examples at `/ai-sdlc:shape`.
   - **Examples reworked after the build started** is high: the examples missed things. Look at which ones changed.
   - **Verification passed first time** is low: plans are too loose. `/ai-sdlc:learn` can turn repeated verifier issues into CLAUDE.md rules.
   - **First ci run passed** is low: `pnpm check` isn't catching what CI catches.
   - **Warnings shipped as they were** keeps growing: check with an engineer whether any matter.
   - **Changes from problem reports** at 0%: reports aren't flowing back. Suggest `/ai-sdlc:triage`.

3. **Say what the numbers can't show.** Work from before the skills existed has no stage times. Very small samples ("based on 2 PRs") mean little.

Never change files, labels or pull requests from this skill.
