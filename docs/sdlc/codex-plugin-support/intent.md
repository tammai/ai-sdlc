---
status: approved
tier: M
approved_by: user
approved_at: 2026-10-09T06:28:03Z
---

# Codex plugin support

## Problem
ai-sdlc is currently packaged and documented as a Claude Code plugin, so Codex users cannot install its SDLC workflows as a plugin or rely on its guardrails.

## Proposed outcome
Developers can install ai-sdlc in Codex, discover and invoke its existing SDLC skills, and use compatible hooks for the supported guardrails; Claude Code packaging and behavior continue to work.

## Affected users and systems
Developers using Codex CLI or the Codex desktop app; plugin manifests and marketplace metadata; shared skills and hook scripts; README and packaging tests.

## Constraints
- Keep one source of truth for the shared skills and hook logic where the runtimes are compatible.
- Preserve Claude Code installation, hook behavior, and current manifest validation.
- Document Codex-specific setup, hook trust, and any guardrail limitations accurately.

## Decisions
- Package the shared skills for Codex CLI and desktop. Provide a Codex hook configuration for the events and output decisions that Codex currently supports, and document where hooks require manual desktop installation or differ from Claude Code. Do not claim identical enforcement across runtimes.
