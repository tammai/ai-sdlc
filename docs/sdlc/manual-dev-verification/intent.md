---
id: manual-dev-verification
artifact: intent
status: approved
tier: S
author: Codex
created: 2026-10-09
approved_by: user
approved_at: 2026-10-09
---

# Manual local verification at review

## Problem
The review stage can reach human approval and ship without asking the human to run a changed app locally. Automated checks and reviewer inspection may not catch behavior that is easiest to confirm in the running app.

## Proposed outcome
Before review approval, when a change affects runnable, user-visible behavior, the reviewer gives the human the project's local start command, URL or entry point, and concrete acceptance checks, then waits for the human's result. Review records the outcome. Changes without a relevant local app/server record why the step is not applicable.

## Affected users and systems
AI-SDLC users and reviewers; `skills/review/SKILL.md` and the generated review artifact template.

## Constraints
- Do not automatically start a server or deploy a preview on the human's machine.
- Do not claim manual verification without the human's explicit result.
- Keep the checkpoint before review approval and before ship.
- Scope the required check to changes with runnable, user-visible behavior; mark other changes not applicable with a reason.

## Open questions
None. Assumption: manual verification is required for relevant app/UI behavior and explicitly recorded as not applicable for changes with no relevant local app behavior.
