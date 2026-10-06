---
name: learn
description: Keep CLAUDE.md as living institutional knowledge — when Claude makes the same mistake twice, a review finding repeats, or the user corrects a convention, write the correction into CLAUDE.md ("Things Claude gets wrong" / Conventions) in one line, keep the file under a page, and propose an eval when the mistake is testable. Use after corrections, repeated review findings, or /ai-sdlc:learn.
argument-hint: "[the mistake or correction]"
---

# Learn — second mistake → CLAUDE.md

1. **Name the mistake precisely**: what Claude did, what's right, where it applies. Not "be careful with money" — "Money is BigDecimal (Java) / integer cents (TS, Go); never float."
2. **Is it really a rule?** It applies beyond this one change, and it happened twice (or the user explicitly says "always/never"). One-off context belongs in the change's artifacts, not CLAUDE.md.
3. **Pick the layer** (playbook control layers — strongest that fits):
   | If the rule… | Put it in |
   |---|---|
   | must hold without exception and is checkable on a path/command | a hook/config: `.sdlc/config.json` `protectedPaths`, `prodPatterns`, or a project hook — and mention it in CLAUDE.md |
   | is a multi-step policy owned by someone (security, API design, brand) | a skill → **policy** skill |
   | is a convention or a known pitfall | one line in CLAUDE.md |
   | is about review judgment | REVIEW.md |
4. **Edit CLAUDE.md**: add the line under "Things Claude gets wrong" or "Conventions". Merge with an existing line if related; delete lines that no longer apply. Keep the whole file ≤ ~60 lines — if it's growing past that, move detail into path-scoped rules or skills and leave a pointer.
5. **Make it testable** when you can: an eval in `evals/` that would fail if the mistake recurred.
6. Show the diff to the user; CLAUDE.md is reviewed like code. Suggest committing as `docs(claude): <rule>`.
