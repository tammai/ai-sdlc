---
id: manual-dev-verification
artifact: verify
status: blocked
tier: S
author: Codex
created: 2026-10-09
---

# Verification: Manual local verification at review

## Evidence

- `skills/review/SKILL.md` now requires the reviewer to identify documented local run instructions, provide the human with a command, entry point, and acceptance checks, and wait for the reported result before review approval or ship.
- The instructions require asking the human for setup details rather than guessing when a command is unclear; they forbid starting the server on the human's behalf or treating automated checks and screenshots as a substitute.
- `templates/artifacts/review.md` records the status, start command, entry point, checks, human result, or reason the step does not apply.
- Marketplace metadata is aligned at `0.9.0` across `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `.codex-plugin/plugin.json`; strict Claude validation passed for both manifests.
- `node test/run.mjs --no-evals` passed outside the sandbox: 207 passed, 1 skipped (Windows-only platform limitation), 0 failed; plugin, marketplace, skills, and agents validation passed.
- `git diff --check` passed.
- `node test/run.mjs --full` passed its unit and validation phases but did not complete the eval phase. On Windows, scaffold scripts were called with malformed `C:\\...` paths; Claude eval runs also reported the configured four-turn limit. The run was stopped after these failures were confirmed. Full eval evidence is therefore incomplete and release is blocked pending a successful supported-environment run.
- No tests were added. This change modifies workflow documentation and an artifact template; it does not add executable app behavior.

## Limitations

- The workflow relies on the reviewer to derive the command from project documentation/configuration and to wait for the human's response; this is a process checkpoint, not automated enforcement.
- Release evaluation remains unverified because the full eval suite did not complete in this Windows environment.
