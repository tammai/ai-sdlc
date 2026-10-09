---
id: manual-dev-verification
artifact: plan
status: approved
tier: S
author: Codex
created: 2026-10-09
approved_by: user
approved_at: 2026-10-09
---
# Plan: Manual local verification at review

Reads: intent.md. Tier S; documentation and workflow guidance only.

## Files that change
- `skills/review/SKILL.md` — add the human local-run checkpoint before review approval and ship.
- `templates/artifacts/review.md` — record applicability, run instructions, checks, and the human's outcome.
- `README.md` — document the manual checkpoint in the workflow summary.
- `CHANGELOG.md` — prepare the 0.9.0 release notes.
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.codex-plugin/plugin.json` — align the plugin release version at 0.9.0.
- `docs/sdlc/manual-dev-verification/intent.md` — mark the approved intent.
- `docs/sdlc/manual-dev-verification/plan.md` — this approved implementation plan.
- `docs/sdlc/manual-dev-verification/verify.md` — record static verification evidence and limitations.
- `docs/sdlc/manual-dev-verification/review.md` — record independent review findings and applicability for this documentation-only change.

## Order of work
1. Define the review artifact fields for required or not-applicable manual verification.
2. Update the review skill to identify the local command and entry point, give concrete checks, and wait for the human's result before approval.
3. Prepare the README, changelog, and aligned marketplace/plugin version metadata for the release.
4. Review the diff and run static whitespace validation plus the documented pre-release checks.

## Tests (proof)
No tests are added. Run `node test/run.mjs --no-evals` for unit and packaging checks, and `node test/run.mjs --full` before release. Check that all marketplace/plugin version fields agree and run `git diff --check`.

## Risks
- Reviewers may guess an incorrect or unsafe local command. Mitigation: derive it from repository run instructions/configuration; if unclear, ask the human for the command rather than guessing.
- A checkpoint can be skipped if applicability is unclear. Mitigation: require an explicit not-applicable reason in review.md.

## Alternatives considered
- Automatically starting the dev server: rejected because it takes control away from the human and may have project-specific side effects.
- Making the check apply to every change: rejected because non-runnable changes have no meaningful manual app check.

## Rollback
Revert the changes to the review skill and artifact template; no runtime state or production data is affected.

## Deviations
Release preparation added README, changelog, and version metadata updates as requested. The full eval suite remains blocked by the available Claude four-turn limit; see verify.md.
