---
name: policy
description: Encode a policy that is enforced inconsistently today (security standard, API design convention, data-classification rule, brand/UX rule, accessibility) as a project skill under .claude/skills/<name>/SKILL.md that triggers on intent, plus a deterministic hook or CI check when it must hold without exception. Use when a review finding cites a policy, a standard keeps being missed, or via /ai-sdlc:policy.
argument-hint: "<policy name or source document>"
---

# Policy — knowledge enforced while writing, not discovered in review

1. **Source of truth:** get the policy text from its owner (doc link, pasted text, ADR). Don't invent policy; if something is ambiguous, list it as a question for the owner.
2. **Write the skill** at `.claude/skills/<kebab-name>/SKILL.md` (ships with the code):
   ```markdown
   ---
   name: <kebab-name>
   description: Apply the <policy>. Use whenever <concrete triggers: creating or modifying X, reviewing Y, generating Z>.
   ---
   # <Policy title>
   Owner: <name/team> · Source: <link> · Version: <date>

   When you <trigger>:
   1. <rule — specific, checkable>
   2. …
   Run <check script, if any> and include its output in your summary.
   ```
   The description decides when it fires: name the actions and artifacts, not the topic. Rules must be checkable ("every state-changing endpoint emits an audit event with actor, action, entity, timestamp"), not aspirations.
3. **Deterministic backstop:** skills are advisory. If a violation must never ship, add one of:
   - a check script (`scripts/check-<policy>.sh|mjs`) the skill runs and CI runs,
   - a path rule in `.sdlc/config.json` (`protectedPaths`) or a project PreToolUse hook,
   - a lint rule / CI job.
4. **Test the trigger:** describe 3 scenarios that should fire it and 1 that shouldn't; check each would load the skill by its description. Add an eval in `evals/` for the most important rule.
5. **Wire it in:** reference it from REVIEW.md's compliance pass ("apply `.claude/skills/<name>`"). Policy changes = skill PRs that the policy owner approves.
6. Report: the skill path, triggers, backstop, and who must sign off.
