---
id: {{id}}
artifact: plan
status: draft
tier: {{tier}}
author: {{author}}
created: {{created}}
approved_by:
approved_at:
---
# Plan: {{title}}
Reads: spec.md (or intent.md for tier S). Status: draft.

## Files that change
<!-- path — new|edit|delete — why. Every file Claude will touch. -->

## Order of work
<!-- Numbered steps, each independently verifiable. Mark steps that can run in a parallel worktree with ∥. -->

## Tests (proof)
<!-- Which tests are added/changed, which AC each covers, and the exact command that must go green. UI: screenshot vs mock. -->

## Risks
<!-- What could break, blast radius, rate limits, migrations, perf. Mitigation for each. -->

## Alternatives considered
<!-- One or two lines each; why not. -->

## Rollback
<!-- How to undo in production: revert PR, flag off, down-migration. -->

## Deviations
<!-- Filled during build: when implementation departs from this plan, record what and why in the same commit. -->
