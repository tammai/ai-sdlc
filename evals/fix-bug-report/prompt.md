---
name: fix-bug-report
tags: [fix-bug-report, skill-fix, triggering]
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill]
---

Bug: GET /reports?from= returns a 500 when the from date is empty. It should default to the first day of the current month. Please fix it.
