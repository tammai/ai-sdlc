---
id: codex-plugin-support
artifact: spec
status: approved
tier: M
author: Codex
created: 2026-10-09
approved_by: user
approved_at: 2026-10-09T06:37:02Z
skills_applied: [spec, setup]
---

# Spec: Codex plugin support

## Requirements

### FR-1 — Install and discover skills in Codex
- **AC-1:** The Codex compatibility manifest points to the repository's existing `skills/` tree; adding a parallel copy of the skills is not required.
- **AC-2:** Codex installation instructions explain local plugin discovery and how to invoke an ai-sdlc skill in Codex.
- **AC-3:** Existing Claude Code manifest and install instructions remain valid.

### FR-2 — Run compatible lifecycle hooks in Codex
- **AC-4:** A Codex-specific hook configuration is selected by the Codex manifest and references the shared Node scripts through the plugin root.
- **AC-5:** The hook scripts accept Codex's `tool_input.command` for shell and `apply_patch` calls; the patch parser derives every touched path and added content for pre- and post-edit checks, and denies unrecognized patch syntax.
- **AC-6:** Codex-supported hook denials use the Codex response shape. Every Claude-style `ask` result and any guard uncertainty/error is mapped to an explicit Codex denial; no unsupported `ask` is emitted from `PreToolUse`.
- **AC-7:** Documentation states that plugin hooks need user trust, and that Codex cannot force the Claude-style approval prompt from `PreToolUse`; project-specific approval gates may therefore have weaker enforcement in Codex.
- **AC-8:** Codex CLI and desktop install surfaces are documented separately. Hooks are described only for surfaces where the current plugin runtime supports them; no claim of full parity is made.

### FR-3 — Keep packaging consistent
- **AC-9:** Packaging metadata stays aligned on plugin name and version.
- **AC-10:** The README describes Claude Code and Codex support without implying Codex uses Claude subscription billing or Claude-only model routing.

## Non-functional requirements
- No runtime dependencies; continue supporting Node 18+.
- Hook handling must retain bounded execution and avoid logging secret contents.
- Keep shared skill content as the source of truth; add only host-specific configuration or guidance where required.

## Design

### Stack & placement
This is a local plugin-packaging integration in the existing Node/Markdown repository. Add a Codex compatibility manifest at `.codex-plugin/plugin.json`, point it at `./skills/`, and select a Codex-specific hook file under `hooks/`. Do not add Codex-specific duplicate skill folders. The shared hook scripts branch on Codex payloads and preserve Claude Code behavior.

### Data model
None. Existing `.sdlc/config.json`, `.sdlc/local/state.json`, and `docs/sdlc/<id>/` remain the configuration and state format.

### API / contract
Codex hook events use JSON on stdin. Adapt the shared hook scripts to read Codex's canonical tool names and `tool_input.command` while preserving Claude Code payload handling. Codex's `apply_patch` command is parsed to enumerate all changed paths and added content before checks run; unrecognized patch syntax is denied. Codex `PreToolUse` supports `permissionDecision: "deny"`; `"ask"` is unsupported, so every prompt-required guard result is denied with a clear reason. Use the Codex `PermissionRequest` response only to allow/deny an approval request already raised by Codex. Use Codex's documented Stop continuation response for verify reminders.

### Rollout
Ship the compatibility manifest, Codex hook configuration, and docs in the same release. Users install through Codex's local plugin/marketplace flow and review/trust bundled hooks before relying on them. Claude Code remains installable from its existing marketplace.

## Policies applied
- Existing package convention: Node hooks remain dependency-free and skills stay under `skills/`.
- Official OpenAI Docs: Codex plugin compatibility manifests can reference skills and hooks; plugin hooks require review/trust. Codex `PreToolUse` cannot return `ask`, and hook availability varies by installation surface.

## Concerns
- [x] Approval gate parity — Codex cannot reproduce Claude's forced ask from `PreToolUse`; prompt-required results are denied, and the README and workflow guidance will explain how to satisfy the workflow and retry.
- [x] Codex CLI hook availability — document shared skills for Codex CLI and desktop, but limit bundled hook claims to manually installed Codex desktop plugins as currently documented.

## Out of scope
- Publishing to the universal public plugin directory.
- Replacing Claude model routing or adding Codex-specific custom agent definitions.
- Making Codex hooks a security boundary; the existing deterministic guards remain best-effort and require hook trust.
