---
id: codex-plugin-support
artifact: plan
status: approved
tier: M
author: Codex
created: 2026-10-09
approved_by: user
approved_at: 2026-10-09T06:37:02Z
---

# Plan: Codex plugin support
Reads: approved intent.md, design.md, and spec.md. Status: draft.

## Files that change
- `.codex-plugin/plugin.json` — new Codex compatibility manifest pointing at the existing skills and Codex hooks.
- `hooks/hooks.codex.json` — new Codex event configuration, separate from Claude matchers.
- `scripts/codex-hook.mjs` — new zero-dependency adapter for Codex hook inputs/outputs and fail-closed parsing of `apply_patch` payloads.
- `scripts/session-start.mjs` — emit a Codex-compatible SessionStart context response and retain Claude output behavior.
- `scripts/route-prompt.mjs` — provide host-appropriate skill invocation context.
- `scripts/post-edit.mjs` — handle Codex patch paths for formatting and dirty-state updates.
- `scripts/guard.mjs` — route Codex `Bash` and parsed `apply_patch` inputs through the existing secret, protected-path, test-lock, approval, plan, and production checks; map Codex prompt-required outcomes to deny.
- `README.md` — document Codex installation, skill activation, hook trust, supported surfaces, and enforcement limits.
- `docs/sdlc/codex-plugin-support/verify.md` — record implementation evidence and limitations.

## Order of work
1. Add Codex compatibility manifest and Codex-only event config, keeping current Claude files intact.
2. Implement a conservative Codex `apply_patch` parser and hook adapter. Derive each touched file and added content before invoking existing guard checks; deny unsupported syntax and never emit Codex `ask`.
3. Adapt session-start, prompt routing, post-edit, and stop behavior for Codex while preserving Claude Code contracts.
4. Update README install and usage instructions, separating Codex CLI skill support from documented desktop plugin-hook support.
5. Review the diff against all ACs and record outcomes and unverified limitations in `verify.md`.

## Tests (proof)
No automated tests will be added or run for this request. Review the JSON manifests/configuration and hook paths, then inspect each Codex hook result mapping and changed-path parser against the official Codex hook contract. Record that runtime installation and hook invocation were not exercised.

## Risks
- A patch parser that misses a path or added line could bypass a guard. Accept only known patch forms and deny malformed/ambiguous input.
- Converting `ask` to `deny` changes Codex UX: users satisfy the workflow or configure the approved release token, then retry.
- Codex requires hook trust; untrusted/disabled hooks do not enforce guards.
- Codex plugin hooks are currently documented for manually installed Codex desktop plugins; CLI skill availability does not imply CLI hook coverage.
- Host-specific instructions could regress Claude behavior; keep Claude manifest/config and responses intact.

## Alternatives considered
- Duplicate all skills into a Codex tree — rejected because it creates content drift.
- Reuse `hooks/hooks.json` unchanged — rejected because Codex tool matchers and ask responses differ.
- Map Codex `ask` to `PermissionRequest` — rejected because that event only runs when Codex has already requested approval.

## Rollback
Remove `.codex-plugin/plugin.json`, `hooks/hooks.codex.json`, and `scripts/codex-hook.mjs`; revert host-specific script and README changes. Existing Claude Code packaging remains usable.

## Deviations
The Codex adapter normalizes `apply_patch` payloads into the existing guard input format, so `scripts/guard.mjs` remains unchanged. This keeps the Claude hook contract stable while sharing its policy logic.
