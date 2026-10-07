---
name: status
description: Show where every change is in the AI-native SDLC chain (intent/spec/plan/verify/review, next step, locked tests, unverified edits) and the playbook's leading/lagging metrics (intent survival, intent→spec and spec→plan lead time, spec rework, plan deviation, first-pass verify rate). Use for "where are we", "what's next", "how are we doing", or /ai-sdlc:status.
---

# Status

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`.

1. `sdlc status` (add `--all` to include closed changes). Summarize: the active change and its next step; other open changes; anything blocked (unapproved spec with Concerns, failed verify, disputed review findings).
2. If asked about health/progress, `sdlc metrics` and interpret against the playbook's direction of travel:
   - intent survival: neither ~100% (rubber-stamping) nor very low (capturing noise)
   - intent→spec / spec→plan: hours, not weeks
   - spec rework after plan, plan deviations: rare; rising = specs/plans too shallow → spend more on interrogation
   - first-pass verify rate: rising = CLAUDE.md, skills and plans are getting better; falling = add evals / learn entries
3. `open:N` on a change row means N unticked open questions or Concerns; they block `sdlc approve spec`. `sdlc gates` shows how strictly each gate is enforced (off · advisory · soft · hard).
4. Offer the single most useful next action (usually: resume the active change with /ai-sdlc:vibe).
