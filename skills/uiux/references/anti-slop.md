# Anti-slop — tells of generic AI-generated UI

Check every generated screen. **P0** = fix before showing the user. **P1** = fix unless DESIGN.md explicitly asks for it. **P2** = note in review.
Each item has an "unless" — the rule is about defaults, not bans.

## P0
- Invented content: fake metrics ("10× faster", "99.9% uptime"), fake testimonials/logos, lorem ipsum, "Title"/"Label" placeholders in shipped UI. *Unless* clearly marked sample data in a demo route.
- Default framework accent left in place (stock Tailwind indigo/violet `#6366f1`, `#4f46e5`, `#8b5cf6`, `#7c3aed`) when DESIGN.md defines another accent.
- Emoji used as icons in product UI.
- Raw color/size values scattered in components instead of tokens (more than a handful of hex values outside the theme files).
- Missing states: async view with only the happy path.
- Accessibility floor violations (see craft-rules.md).

## P1
- Purple→blue/cyan two-stop gradients, glows, glassmorphism + neon, bokeh blobs, wave SVG backgrounds as decoration. *Unless* the brand is built on it.
- Grid of identical cards (icon + heading + two lines) used as filler content.
- Marketing hero (huge headline + gradient + two CTAs) on an operational tool or dashboard.
- Dark "cockpit" theme chosen by default for an app that will be used in daylight offices.
- Every corner the same radius; every section the same padding; everything centered.
- ALL CAPS headings (small tracked labels are fine); Title Case Everywhere.
- Colored pills/badges on every number; red/green deltas without text or icon; gradient-filled metric text.
- Generic CTAs: "Submit", "Click here", "Get started" on an in-app action.
- Accent color on more than ~3–5 elements per viewport.
- `transition: all`, bounce easing, entrance animations on every element.
- Placeholder image services (unsplash/placehold) left in shipped UI.

## P2
- Perfect symmetry everywhere; no signature detail at all.
- Numbered eyebrows ("01 — Features") and other template-landing scaffolding inside an app.
- Div-built fake screenshots of the product.
- Rounded card with a thick colored left border as the default callout.

## When the rules invert
- Marketing/landing pages may use more color, larger type and expressive motion — still no invented content.
- Brand-led products may own a gradient or a bold dark theme — if DESIGN.md says so.
- Data-dense pro tools may break "generous whitespace" — density is a feature there; hierarchy still must work.
