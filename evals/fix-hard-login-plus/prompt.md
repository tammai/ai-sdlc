---
name: fix-hard-login-plus
tags: [fix-hard-login-plus, skill-fix, triggering, hard]
max_turns: 3
allowed_tools: [Read, Glob, Grep, Skill]
---

Logging in with an address like anna+work@example.com says "invalid email". It should just work.
