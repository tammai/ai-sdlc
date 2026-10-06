# DESIGN.md — <Product>

<!-- The project's design contract. Read by the uiux skill on every UI task. Authority order:
     this file (brand tokens) > uiux craft rules > component-library defaults.
     Keep values concrete; "clean and modern" is not a rule. -->

## 1. Product & users
- Purpose (one sentence):
- Primary user (role, context, device):
- Principles (3–5, ranked — the higher one wins a conflict):
  1.
- Out of scope (visual / UX):

## 2. Visual theme & atmosphere
- Mood (3 words):
- Density: comfortable | compact
- Signature detail (the one memorable thing):

## 3. Color roles
<!-- Semantic tokens → values. Light and dark designed separately (not inverted). Accent ≤ ~10% of an app screen. -->
| Role | Light | Dark | Used for |
|---|---|---|---|
| primary / accent | | | the one primary action, focus, selection |
| neutral (surface 0/1/2, border, text, text-muted) | | | 90%+ of the UI |
| success / warning / error / info | | | status only — never decoration |

## 4. Typography
- Families: body …, display … (≤ 1 display face), mono …
- Scale in use (4–6 steps):
- Weights in use (≤ 3):
- Numbers: tabular in tables and metrics.

## 5. Space, shape, elevation
- Spacing scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64
- Radius: input …, card …, modal …, pill 9999
- Elevation: (light) layered shadows sm/md/lg · (dark) 1px ring + lighter surface

## 6. Motion
- Durations: 120 (hover) · 200 (menus/toggles) · 280 (modals/drawers) · 400 (page/sheet)
- Easing: ease-out for enter, exit ≈ 0.75 × enter; only transform + opacity; honour reduced motion.
- Budget: <surface>: none | micro only | expressive

## 7. Components
- Library: Nuxt UI | shadcn/ui | Material 3 (Flutter) — used wholesale, extended via tokens, never paralleled.
- House variants / overrides (where they live: app.config.ts / components/ui / ThemeData):
- Icons: one set (…), one stroke weight.

## 8. Layout & responsive
- Breakpoints / size classes:
- Navigation pattern per surface (web / mobile / desktop):
- Max content width / prose measure (≤ 65ch):

## 9. Do's and don'ts
- Do:
- Don't:

## 10. Learned constraints (append-only)
<!-- YYYY-MM-DD — rule — why (user correction or review finding). Overrides defaults, never the accessibility floor. -->
