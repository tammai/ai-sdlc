---
name: triage
description: Stage 6 (Maintain) of the AI-native SDLC — close the loop. Turn an incident, alert, monitoring band breach (sdlc detect), failing CI trend, security-scan finding or support escalation into a diagnosis and a new intent.md that re-enters the pipeline; bounded fixes go straight to a PR through the review gate; each fixed incident becomes a permanent eval. Use for "production is broken", "this alert fired", "CI keeps failing", scan findings, or /ai-sdlc:triage.
argument-hint: "<incident, alert, metric or finding>"
---

# Triage — findings re-enter the pipeline as intent.md

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`. Run it inline as `node "<that path>" <args>` every time; never put the command in a shell variable (zsh does not word-split `$sdlc`) and never define a shell function (it does not parse in PowerShell).

Detection stays deterministic; Claude diagnoses once a band is breached; the tier decides what Claude may do.

## 1. Classify
- **Metric anomaly:** `sdlc detect` (reads `.sdlc/bands.json`; rolling baseline + Western Electric rules). Tier → action: `1sigma` log only · `2sigma` diagnose read-only · `3sigma` propose a fix via PR or a pre-approved runbook (e.g. rollback, quarantine flaky test). Do no more than the tier allows.
- **Incident in progress:** mitigation first, and only through existing, pre-approved routes (the rollback pipeline, a feature flag). Production commands hit the prod gate — a human authorizes. Then diagnose.
- **Scan / review finding:** bounded (one place, clear patch) → fix flow; wider (pattern across the codebase, architectural) → intent.

## 2. Diagnose (read-only)
Dispatch the researcher routed at the severity: `sdlc route researcher --complexity complex` for production incidents and 3σ, `normal` otherwise. Ask for: timeline (deploys/commits/runs around the breach), evidence (commands + output), likely cause with confidence, blast radius. Verify the top hypothesis yourself with one direct check before writing it down.

## 3. Write it back into the pipeline
`sdlc new "<symptom, not cause>" --source incident|monitor|scan --tier <S|M|L>` → fill intent.md: anomaly, evidence, likely cause, proposed outcome, affected systems, open questions. Small, bounded fix with a clear cause → continue with the **fix** skill now. Otherwise stop at a draft intent for the service owner to triage (accept → normal stages; dismiss → `sdlc reject intent --reason` so bands can be tuned).

## 4. Prevent recurrence (after the fix ships)
- Add an eval reproducing the incident class: `evals/<id>.json` (`sdlc scaffold evals` if missing). It stays in the suite forever.
- Lessons: append to `docs/sdlc/LESSONS.md` (date, symptom, cause, fix, eval id) — future diagnoses read it first.
- If a guardrail would have prevented it: propose a hook/config change (protectedPaths, prodPatterns) or a policy skill.

For unattended operation, `sdlc scaffold ci-monitor` installs the scheduled workflow that runs detect → diagnose → intent PR without a person in the invocation path.
