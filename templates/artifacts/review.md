---
id: {{id}}
artifact: review
status: draft
tier: {{tier}}
reviewer: reviewer-subagent
implemented_by:
reviewed_by:
independence:
created: {{created}}
approved_by:
approved_at:
---
# Review: {{title}}
Passes per REVIEW.md. The agent that wrote the code did not write this review.

## Important
<!-- [pass] file:line — finding — failure scenario (inputs → wrong outcome) — suggested fix -->

## Nits (max 5)

## Compliance vs spec.md / plan.md
<!-- Each FR/AC: covered by which test, or GAP. Files changed that are not in plan.md. -->

## Manual verification
status: pending
<!-- Allowed statuses: pending, verified, not applicable. For pending/verified: local start command, URL or entry point, concrete checks, and the human-reported result. Keep pending until the human reports a successful run. For not applicable: explain why there is no relevant runnable, user-visible behavior to check. -->

## Resolution
<!-- For each Important: fixed in <sha> | accepted risk by <human> | disputed (why). -->
