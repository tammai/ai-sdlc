---
id: codex-plugin-support
artifact: review
status: approved
tier: M
reviewer: independent-subagent
implemented_by: codex_implementation
reviewed_by: codex_final_review, codex_review_round2
independence: independent-subagent
created: 2026-10-09
approved_by: user
approved_at: 2026-10-09T06:54:25Z
---

# Review: Codex plugin support

Independent review against the approved spec and plan. The repository has no `REVIEW.md` or initialized `sdlc` configuration, so this report records the bugs, security, and compliance passes directly.

## Important

- **Found: 2; fixed: 2; disputed: 0; remaining: 0.**
- The first review found unbounded patch parsing and malformed tool payloads could fail open. The adapter now caps input, patch, target-file, file-count, hunk-count, source-line and matching-work sizes; it has a seven-second pre-hook watchdog and validates non-empty string commands for `Bash` and `apply_patch`. Non-regular/oversized targets are rejected. Exceeding limits or encountering malformed input emits Codex `deny`.
- The second review found the CLI setup path missing. README now documents marketplace registration and trusted-project `.codex/config.toml` enablement, while keeping bundled hooks desktop-only.

## Nits (max 5)

- **Found: 2; fixed: 2.** Anchored the Codex tool matchers. Replaced ambiguous local-checkout wording with a concrete local marketplace entry and install/update steps.

## Compliance vs spec.md / plan.md

| Criterion | Result | Evidence / gap |
|---|---|---|
| AC-1 | Pass | `.codex-plugin/plugin.json` references shared `./skills/`. |
| AC-2 | Pass | README documents marketplace discovery and `$skill-name` invocation. |
| AC-3 | Pass | Claude manifest and existing Claude hook configuration are unchanged. |
| AC-4 | Pass | Codex manifest selects `hooks/hooks.codex.json`; commands use `${PLUGIN_ROOT}`. |
| AC-5 | Pass by inspection | Adapter validates and bounds Codex `tool_input.command`, reconstructs supported patches, and denies unknown or ambiguous syntax. Runtime patch execution remains unverified. |
| AC-6 | Pass | Prompt-required, unknown, malformed, timeout, and guard-error outcomes deny; no Codex `ask` is emitted. |
| AC-7 | Pass | README documents hook trust and denial in place of an interactive approval prompt. |
| AC-8 | Pass | README gives separate CLI enablement and desktop install steps and states that bundled hooks are desktop-only. |
| AC-9 | Pass | Codex manifest name/version match the Claude plugin metadata. |
| AC-10 | Pass | README separates Codex account/model setup from Claude billing and Claude subagent routing. |

## Resolution

- First-pass Important findings: fixed in the current working tree; no commit was requested.
- Second-pass Important finding: fixed in the current working tree; no commit was requested.
- Compliance gaps: none. Static checks passed; no tests were added or run, as requested. Codex installation and live hook execution were not exercised.
- Unplanned files: none. `scripts/guard.mjs` remains unchanged as documented in `plan.md` because the adapter normalizes Codex payloads into the existing guard input.
- Codex hook support is documented for manually installed desktop plugins; hooks require user trust and are not a security boundary.
