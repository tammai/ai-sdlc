---
name: triage-alert
tags: [triage-alert, skill-triage, triggering]
max_turns: 4
allowed_tools: [Read, Glob, Grep, Skill]
---

The API p95 latency alert fired three times last night — p95 went from 180ms to 2.4s around 02:00 and recovered by itself. Figure out what's going on and what we should do about it.
