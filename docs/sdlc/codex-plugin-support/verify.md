---
id: codex-plugin-support
artifact: verify
status: passed
tier: M
author: Codex
created: 2026-10-09
---

# Verification: Codex plugin support

## Evidence

- Added `.codex-plugin/plugin.json` with the shared `./skills/` directory and Codex hook config reference. Its name and version match `.claude-plugin/plugin.json`.
- Added `hooks/hooks.codex.json` with Codex lifecycle events routed through `scripts/codex-hook.mjs`; the existing Claude hook manifest is unchanged.
- Added a Codex adapter that rejects malformed or ambiguous `apply_patch` input, checks every parsed path and resulting file content through the shared guard, maps prompt-required guard outcomes to Codex `deny`, and supplies host-specific lifecycle context.
- Updated README instructions to distinguish Codex desktop hook support from Codex CLI skill use, explain hook trust and weaker approval prompting, and avoid implying Claude billing or model routing.
- Independent review identified and led to fixes for a missing Codex manifest author/interface, a valid end-of-file patch marker, and fail-open handling of unknown guard decisions.
- Independent review then identified unbounded parser work and malformed tool payload handling; the adapter now applies explicit size/work/time bounds, validates required commands, and denies overflow/invalid input. The final review found no remaining Important findings.
- Static checks passed after implementation: Node syntax checks for changed hook scripts, JSON parsing for both Codex manifests, and `git diff --check`.
- No automated tests were added or run. Runtime installation and hook invocation were not exercised.

## Limitations

- The patch parser deliberately rejects file moves, ambiguous context, unknown patch directives, and patch forms it cannot safely reconstruct. Review Codex's current patch format before broadening it.
- Codex hook enforcement depends on the user trusting the plugin's hooks. Prompt-required gates are denials, not interactive approvals.
- The bundled hook configuration is documented for manually installed Codex desktop plugins. CLI skill availability does not imply CLI hook coverage.
