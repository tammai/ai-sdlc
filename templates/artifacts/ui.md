---
id: {{id}}
artifact: ui
status: draft
tier: {{tier}}
author: {{author}}
created: {{created}}
direction:
approved_by:
approved_at:
---
# UI design: {{title}}
Reads: intent.md, DESIGN.md. Status: draft. Feeds: spec.md (UI section), plan.md.

## Understanding
<!-- Surface(s) (web / mobile / desktop), primary user + context + device, the one primary task per screen, what's strongest in the current UI (keep it), what's weakest. Label each line Known / Inferred / Unknown. -->

## Directions (pick one)
<!-- 2–3 directions, each: one-line thesis, layout sketch (ASCII ok), density, signature detail, what it risks.
     A = conservative (closest to DESIGN.md), B = reference-inspired (name the reference and the transferable trait), C = optional bold. -->

## Chosen direction
<!-- Filled after the user picks: direction + adjustments the user asked for. -->

## Screens & states
| Screen | Primary action | States covered (idle/loading/empty/error/partial/success/conflict/offline) | Notes |
|---|---|---|---|

## Flow
<!-- Trigger → steps → confirmation → failure/recovery. Clicks/taps per task; dead ends: none. -->

## Copy
<!-- Button labels (verb + noun), empty states (why + next action), errors (what happened, why, what to do), confirmations (object + consequence). -->

## Tokens & components
<!-- Component-library primitives used (Nuxt UI / shadcn / Material 3), tokens added or extended in DESIGN.md — never one-off values. -->

## Evaluation plan
<!-- What the ui-reviewer checks and how: renderer (Playwright/screenshot/golden) or "code-only". Viewports: 375, 768, 1280 (web); compact/regular (mobile); min window size (desktop). -->
