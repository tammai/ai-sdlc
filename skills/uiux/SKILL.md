---
name: uiux
description: UI/UX design and review for web (Nuxt UI / shadcn + Tailwind), mobile (Flutter Material 3) and desktop (Tauri) — UX discovery interview, a committed DESIGN.md contract, 2–3 design directions before building, ui.md with screens/states/flow/copy, numeric craft rules (spacing, type, color, motion, a11y), an anti-slop list, a capped one-fix-per-iteration polish loop, and an evidence-gated ui-reviewer that states what was actually rendered. Use for any screen, page, component, flow, redesign, "make it look good", "review this UI", "polish", design system/tokens work, or /ai-sdlc:uiux.
argument-hint: "[screen/flow to design, 'review', 'polish', or 'design-md']"
---

# UI/UX — taste with receipts

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`; `REF` means `${CLAUDE_PLUGIN_ROOT}/skills/uiux/references`.

**Authority order** when rules collide: security & privacy → accessibility & the primary task → truthful content → platform conventions & semantics → DESIGN.md (project tokens and learned constraints) → `REF/craft-rules.md` defaults → component-library defaults → novelty. Never trade a higher item for a lower one.

Pick the mode from the request:

## Mode A — Design contract (`design-md`; also runs automatically the first time UI work happens and DESIGN.md is missing)
1. `sdlc scaffold design-md` → `DESIGN.md`. Fill it from what exists: component library config (Nuxt UI `app.config.ts` + `main.css` `@theme`, shadcn `components.json` + CSS variables, Flutter `ThemeData`), existing colors/fonts/spacing in code, logo/brand assets.
2. Missing essentials → ask **one** message with at most 4 questions: overall feel (e.g. calm/utilitarian, warm/friendly, bold/editorial, dense/pro), accent color, typeface (or "use the library default"), motion (none / subtle / expressive). Skip any the user already answered.
3. Tokens go into the library's mechanism, never parallel to it (`REF/platforms.md`). Commit DESIGN.md with the tokens.

## Mode B — Design a screen/flow (tier M/L UI changes, before the spec; tier S → inline in the plan)
1. **Understand** (gate 1). If the user/problem is fuzzy, run the discovery interview in `REF/discovery.md` (3–5 questions per round, synthesize after each answer, label Known/Inferred/Unknown). Output the "Understanding" section of ui.md: surface(s), primary user + context, the one primary task per screen, strongest thing in the current UI (keep it), weakest.
2. `sdlc draft ui` → `docs/sdlc/<id>/ui.md`.
3. **Directions** (gate 2): 2–3 options — A conservative (closest to DESIGN.md), B reference-inspired (name the reference + the one transferable trait; reject traits that cost readability), optional C bold. Each: thesis line, ASCII layout sketch, density, signature detail, risk. Recommend one. **Stop and let the user pick** unless they said "just decide".
4. **Specify** the chosen direction: screens table with states (`REF/states-and-copy.md` lattice), flow with failure branches, copy (verb + noun actions, 3-part errors, empty states with a next action), tokens/components used. Then `sdlc approve ui --by "<name>"` on the user's yes. The **spec** skill takes the UI section from ui.md.

## Mode C — Build UI (inside the build stage)
Before generating a component, assemble its constraints block (put it in the implementer's prompt): role of the component, the primary action, ≥5 concrete requirements incl. one count rule (e.g. "≤ 7 visible columns"), one a11y rule, one responsive rule, the states it must render, and hard limits ("use Nuxt UI `UTable`; no new dependencies; only files in plan.md"). Follow `REF/craft-rules.md` + DESIGN.md; check against `REF/anti-slop.md` before reporting.

## Mode D — Review / polish
- **Review**: `sdlc route ui-reviewer` (tier L or a redesign → `ui-reviewer-complex`). Pass the change id and the absolute paths of `REF/craft-rules.md`, `REF/anti-slop.md`, `REF/states-and-copy.md`, `REF/platforms.md`. Findings feed review.md under a `[ui]` tag; Critical = blocks a task or fails accessibility.
- **Polish loop** (`polish`): pick a preset — `anti-slop`, `states`, `tokens`, or `a11y`. Each iteration: fix the **single** highest-severity finding, re-render/re-check, repeat. Budget 3 iterations (hard cap 5; never extend silently). End with: fixed, remaining, renderer used.

## Honesty contract (every UI report)
State the renderer: `playwright/screenshot @ widths, light+dark` | `flutter goldens` | `code-only — visual unverified`. Use **Ran / Skipped (reason) / Manual** for every check (build, screenshots, axe/contrast, goldens). Never claim a visual or accessibility check that didn't run.

## Learning
A user correction about look or feel ("too busy", "we never use pills") → append a dated line to DESIGN.md §10 "Learned constraints" (rule + why). It overrides defaults on the next task — never the accessibility floor.
