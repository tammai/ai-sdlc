# Craft rules — defaults with numbers

DESIGN.md overrides these values; nothing overrides the accessibility floor. Use the component library's tokens to express them.

## Hierarchy & layout
- One element dominates each view (squint test). Hierarchy tools in this order: space → size → weight → color.
- Spacing scale only: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96. Inside a group < between groups < between sections.
- Nested radius: outer = inner + padding. Radius varies by role (inputs < cards < modals), not one value everywhere.
- Z-index scale only: dropdown 10 · sticky 20 · overlay 30 · modal 40 · toast 50 · tooltip 60.
- Prose measure 45–75ch. App content max width set once.
- Avoid: cards inside cards, centered-everything, equal spacing everywhere, arbitrary z-index.

## Typography
- One body family, at most one display family. ≤ 3 weights on a surface. 4–6 sizes from the scale per surface (e.g. 12 · 14 · 16 · 20 · 24 · 30 · 36 · 48).
- Line height: body 1.5–1.65, dense UI 1.3–1.4, headings 1.1–1.25, CJK body ~1.75.
- Large headings: slight negative tracking (≈ −0.01 to −0.02em). Small uppercase labels: positive tracking. Never track body text.
- `tabular-nums` for numbers in tables, metrics, prices, timers. `text-wrap: balance` for headings.
- Sentence case for UI text. Mobile inputs ≥ 16px (web) to avoid zoom.

## Color
- App UI: ~90% neutrals, one accent for the primary action/focus/selection. Status colors (success/warning/error/info) carry status only.
- Tinted neutrals (slightly warm or cool) over pure gray; define in OKLCH where the stack allows (Tailwind v4 does).
- Contrast (WCAG 2.x): body text ≥ 4.5:1, large text (≥ 24px regular / ≥ 18.66px bold) ≥ 3:1, UI components and focus indicators ≥ 3:1. Thresholds are hard: 4.49:1 fails.
- Never color as the only signal (add icon, text or shape).
- Dark mode is designed, not inverted: near-black tinted canvas (not #000), off-white text (not #fff), elevation by lighter surfaces/1px rings instead of shadows, accent slightly desaturated. Respect system preference; offer an override only if DESIGN.md says so.

## Motion
- Durations: 120ms (hover/press) · 200ms (menus, toggles, tabs) · 280ms (dialogs, drawers) · 400ms (page/sheet). Exit ≈ 0.75× entrance.
- Ease-out for entering (e.g. `cubic-bezier(.22,1,.36,1)`), ease-in-out for moving on screen. No bounce/elastic in product UI; no linear for movement.
- Animate only `transform` and `opacity`; never `transition: all`; never animate width/height/top/left.
- Frequency budget: actions used many times a day get no or minimal animation; settings/admin get no entrance animations; dashboards micro-interactions only.
- `prefers-reduced-motion`: remove movement (keep opacity fades, spinners and focus rings). Flutter: respect `MediaQuery.disableAnimations`.

## Accessibility floor (non-negotiable)
- Every interactive element reachable and operable by keyboard; visible `:focus-visible` indicator (≥ 2px, ≥ 3:1). No positive `tabindex`.
- Labels: every input has a visible label (placeholder is not a label); icon-only buttons have an accessible name; decorative icons hidden from AT.
- Dialogs trap focus, close on Escape, restore focus to the trigger.
- Targets: web ≥ 24×24px minimum, primary and touch targets ≥ 44×44px; Flutter ≥ 48×48dp; desktop dense controls ≥ 24px with adequate spacing.
- Errors: tied to the field (`aria-describedby` + `aria-invalid`), focus the first invalid field on submit, announce async results politely (`aria-live="polite"`).
- Text scales to 200% (web zoom / Flutter `textScaler`) without loss of content. Respect safe areas (`env(safe-area-inset-*)`, Flutter `SafeArea`). Use `dvh`, not `100vh`, on mobile web.
- No more than 3 flashes per second.

## Forms
- Single column. Hints above the field. Validate on blur after first interaction, re-validate on change once invalid; never clear the form on error; never block paste.
- Choice widget by option count: 2–5 radios/segmented · 6–15 select · more → searchable combobox.
- Long forms: steps of ~5–7 fields, show progress and expected effort. Destructive confirmation names the object; type-to-confirm only for irreversible bulk deletes.

## Data-dense screens (dashboards, tables)
- First viewport: the 3–4 numbers that matter + one chart + the start of the table. Numbers right-aligned, text left-aligned. Sticky header on long tables; virtualize very long ones; ≤ ~7 visible columns by default (more behind column picker).
- Unknown values render as "—", never `null`, `N/A` or a fake 0.
- Charts: bars start at zero; ≤ 5 lines per chart; no pie with > 5 slices (prefer bars); colorblind-safe categorical palette; direct labels over legends when possible.

## Icons & imagery
- One icon set, one stroke weight, sized with the text it accompanies. No emoji as UI icons. Images have fixed aspect ratio boxes (no layout shift) and alt text (empty alt for decorative).
