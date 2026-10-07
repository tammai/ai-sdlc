# Vibes — the look decision, made once

The setup skill asks for a vibe before scaffolding; the first UI task asks only if DESIGN.md §2 has no `Vibe:` line. The result is recorded in DESIGN.md, which is the only authority afterwards.

The decision model is borrowed from [Hallmark](https://github.com/nutlope/hallmark) (MIT, Together AI): pick a genre first, make the tone an extreme and never "clean and modern", go custom only when the brief carries a brand anchor, ask once and let "you pick" through with the inference stated, and lock the choice into tokens. Its landing-page catalog (21 themes, macrostructures, nav and footer archetypes, hero enrichment) is not ported: it is the look `anti-slop.md` flags on app UI.

## Presets
Seeds, not final values. The accent seeds were checked at ≥ 4.5:1 (white text on the light accent, the accent on its own canvas in both modes); the neutrals and any brand colour still need the `craft-rules.md` check (body text ≥ 4.5:1, UI ≥ 3:1) in **both** modes. Every preset designs light and dark, keeps the accent to ~10% of a screen, and uses roman (never italic) headings.

| | **Crisp & technical** | **Warm & friendly** | **Editorial & bold** | **Dark & atmospheric** |
|---|---|---|---|---|
| Hallmark genre | modern-minimal | playful | editorial | atmospheric |
| Fits | dev tools, B2B, dashboards, admin, internal tools | consumer, onboarding, community, family, wellness | reading, publishing, learning, portfolio, anything text-led | AI, generative, music, video, voice, late-night media |
| Mood · density | precise, quiet, fast · compact | warm, soft, encouraging · comfortable | confident, literate · comfortable, prose 60–70ch | immersive, calm, luminous · comfortable |
| Neutrals (light / dark) | cool tint, hue 260: `oklch(0.985 0.003 260)` / `oklch(0.17 0.01 260)` | warm tint, hue 85: `oklch(0.98 0.008 85)` / `oklch(0.2 0.012 60)` | paper, hue 90: `oklch(0.975 0.01 90)` / `oklch(0.18 0.008 70)` | `oklch(0.97 0.006 280)` / `oklch(0.16 0.015 280)` |
| Accent seed (light / dark) | cobalt, hue 250: `oklch(0.52 0.17 250)` / `oklch(0.75 0.12 250)` | coral, hue 40: `oklch(0.54 0.17 40)` / `oklch(0.76 0.12 45)` | ink green, hue 155: `oklch(0.45 0.12 155)` / `oklch(0.75 0.11 155)` | mint, hue 175: `oklch(0.5 0.1 190)` / `oklch(0.8 0.13 175)` |
| Radius (input · card · modal) | 6 · 8 · 12 | 12 · 16 · 24 | 4 · 4 · 8 | 10 · 14 · 20 |
| Type | Geist + Geist Mono; one family, no display face | Plus Jakarta Sans; one family | display Newsreader (roman), body Geist | Geist; Geist Mono for status and numbers |
| Motion | micro only: 120–200ms | subtle: 200–280ms, one delight moment (e.g. a success) | none or fades only | subtle to expressive on the media/generation surface, micro elsewhere; 280–400ms |
| Signature detail | 1px hairlines, tabular mono numerals, visible shortcut hints | soft tinted surfaces, hand-built empty-state illustrations | big type-scale contrast (48+ vs 16), 1px rules as dividers | one soft glow on the active or generating element, at most one per screen |
| Don't | marketing hero on a tool; decorative gradients | sharp 90° corners; stern all-grey screens | rounded-everything; accent on body text | purple→blue gradients; glow on more than one thing; `#000` canvas |

`Dark & atmospheric` is never the default: `anti-slop.md` flags a dark cockpit as the default for an app used in daylight. It is reached by picking it, by typing it under Other, or by Claude inferring it from an AI/media app.

## Claude chooses
Infer from what the app is. Use the first row that matches, say it in one line (`Vibe: Crisp & technical, because this is an internal ops dashboard. Say a different one and I'll redo the tokens.`), and record it as inferred.

| Signal in the idea | Preset |
|---|---|
| AI tool, generative, music, video, voice, media | Dark & atmospheric |
| content, reading, publishing, learning, portfolio, news | Editorial & bold |
| consumer, casual, family, community, wellness, onboarding | Warm & friendly |
| dev tool, B2B, dashboard, admin, API, internal, or no signal | Crisp & technical |

Two rows match → take the one for the primary screen and name the other in the line. Don't ask.

## Custom
Fires only on a brand anchor: a hex colour, a named font, a reference site or app, a moodboard, or three or more vibe words that no preset carries (one word like "warm" is a tone, and the presets already have it).
1. Take the nearest preset as the base for density, radius, motion and type roles.
2. Replace the accent seed with the brand colour, and the font if one was named. A named font replaces the preset's primary family (its display face when the preset has one, otherwise its single family, so it then sets all the text); if two are named, the first is display and the second body. If it is unclear whether the font is meant for headings only or for everything, take the reading above and say which in your one-line summary so the user can redirect. A display serif as the only family is a readability call: keep body text at weight 400 and size 16px or more, and say in the summary that the user can pair it with a plain sans for body if it reads too heavy. Build the 50–950 ramp (or the Flutter seed) from the brand colour.
3. If the brand colour fails contrast as a fill or as text, keep it for large surfaces and pick a darker or lighter step for the controls. Never ship a failing pair to honour the brand.
4. A reference gives one transferable trait, named in DESIGN.md §2; reject traits that cost readability (as in uiux Mode B).
5. Record the `Vibe:` line (format below) with `custom (base: <preset>)`.

## The `Vibe:` line
One format everywhere (DESIGN.md §2, the setup skill, the uiux skill): `Vibe: <preset | custom (base: <preset>)> — <picked | inferred from <signal>>[; brand anchor: <colour, font, reference>]`.
- Picked from the menu: `Vibe: Crisp & technical — picked`.
- Claude chose: `Vibe: Warm & friendly — inferred from a consumer tea subscription`.
- Custom: `Vibe: custom (base: Warm & friendly) — inferred from a consumer tea subscription; brand anchor: #0f766e, Fraunces`.

## Landing the values
Write DESIGN.md first (§2 mood, density, vibe line, signature; §3 the colour roles with the real values; §4 families; §5 radius; §6 motion budget; §9 the preset's "Don't" plus "Do: use tokens only"). Then put the same values where the stack reads them (`platforms.md` explains each mechanism):

| Template | Where |
|---|---|
| `*-nuxt`, `tauri-vue` | `app/assets/css/main.css` and `app/app.config.ts` (create it if the template has none); the exact shape is in "Nuxt UI" below; `tauri-nuxt` next to a Nuxt web app: same values in each app, and `app.config.ts` in `packages/ui-layer` |
| `*-react`, `*-next`, `edge-web-hono-react` | `:root` and `.dark` variables in `src/index.css` / `app/globals.css`, `--radius`, `--font-sans` in `@theme inline` |
| `flutter` | `ColorScheme.fromSeed` and `textTheme` in `lib/app/theme.dart`; radii in the theme extension |
| `expo` | the `light` / `dark` palettes, `radius` and `font` in `src/theme.ts` (hex: convert the OKLCH seeds) |

**Nuxt UI** (every `*-nuxt` template and `tauri-vue`). Details that are easy to get wrong (each was found by building and measuring, not by reading):
```css
/* app/assets/css/main.css */
@import "tailwindcss";
@import "@nuxt/ui";
@import "@fontsource-variable/<font>";           /* bundled font; the family is named '<Font> Variable' */

@theme static {                                   /* `static`: Tailwind v4 otherwise drops ramp steps no class uses */
  --font-sans: '<Font> Variable', ui-serif, Georgia, serif;
  --color-brand-50: …;  /* … through --color-brand-950 */
}
:root { --ui-primary: var(--color-brand-700); --ui-radius: 0.5rem; }  /* light primary: a step with white text ≥ 4.5:1, usually 600–700 */
.dark { --ui-primary: var(--color-brand-400); }                         /* dark primary: usually 400 */
```
```ts
// app/app.config.ts
export default defineAppConfig({ ui: { colors: { primary: 'brand', neutral: 'stone' } } })
```
- Without the `--ui-primary` lines, Nuxt UI uses step 500 in light mode, which for most brand colours fails contrast with white text, and the brand colour is not the one on the buttons.
- Put the `:root` and `.dark` lines after the imports, unlayered, so they win over Nuxt UI's inline theme.
- **Every `:root` override needs a matching `.dark` one.** Your overrides are unlayered, so they beat Nuxt UI's layered `.dark` rules; set `--ui-primary` and any other `--ui-*` in both, or dark mode keeps the light value.
- **Tinted neutrals** (the Warm and Editorial presets' paper, the dark presets' tinted black): Nuxt UI's light canvas is a hard-coded white (`--ui-bg: #fff`), and `ui.colors.neutral` only picks a ramp, so do both. Define a second ramp in `@theme static` (`--color-paper-50` … `--color-paper-950`) with these lightness steps: 50 `0.975` · 100 `0.955` · 200 `0.915` · 300 `0.86` · 400 `0.71` · 500 `0.53` · 600 `0.45` · 700 `0.37` · 800 `0.28` · 900 `0.20` · 950 `0.145`; chroma about 0.01 at the light end rising to 0.015 at the dark end, set `neutral: 'paper'` in `app.config.ts` so the text, border and surface roles derive from it, and pin the canvas: `:root { --ui-bg: var(--color-paper-50) }` and `.dark { --ui-bg: var(--color-paper-900) }`. With `neutral: 'paper'` the roles derive from the ramp like this (light / dark; measured in the built CSS of Nuxt UI 4.11): `--ui-bg` is hard-coded `#fff` in light (so pin it, above) and step 900 in dark; `--ui-bg-muted` 50 / 800; `--ui-bg-elevated` 100 / 800; `--ui-bg-accented` 200 / 700; `--ui-border` 200 / 800; `--ui-border-muted` 200 / 700; `--ui-border-accented` 300 / 700; `--ui-text` 700 / 200; `--ui-text-toned` 600 / 300; `--ui-text-muted` 500 / 400; `--ui-text-dimmed` 400 / 500; `--ui-text-highlighted` 900 / hard-coded `#fff`. Write these into DESIGN.md §3 from the ramp you built, and confirm two or three of them from computed styles in a browser (canvas, muted text, border); don't assume the mapping.

The ramp is authoritative, not the preset's seed table: use one hue for the whole ramp (the light seed's), so the dark canvas (step 900) can differ from the preset's dark seed by a few degrees of hue, which is imperceptible at this chroma. Record the values you built in DESIGN.md §3. Then **measure the muted text**: Nuxt UI's `text-muted` is step 500 on the light canvas and step 400 on the dark one, and both must be ≥ 4.5:1 (lowering step 500 from 0.55 to 0.53 took it from 4.32:1 to 4.92:1 on the Warm canvas).
- **Brand ramp:** the brand colour's hue; lightness from 0.975 (50) to 0.22 (950) in roughly even steps, but anchored: set the step that holds the brand colour (usually 600 or 700) to the brand colour's own lightness and interpolate the rest around it. Chroma: about 0.15× the brand's chroma at 50, rising to the brand's chroma at its own step (peak around 500–600 for a mid-dark brand), easing to about 0.4× at 950. Put the brand colour (or the nearest step that passes) at the light primary, and a lighter step (about 400) at the dark primary. A step slightly outside sRGB is fine: the browser clips it, so measure the contrast from the rendered pixels.
- **A display face** (skip this when one font sets all the text, e.g. a custom font on a one-family preset): add a second family (`--font-display: '<Font> Variable', …` in `@theme static`) and apply it where the preset says (hero and page titles, card titles): `h1, h2, h3 { font-family: var(--font-display) }` in `@layer base`. The weight set there does not win: Nuxt UI's own `font-bold` classes do, so titles render at 700. Accept it and record 700 in DESIGN.md §4, or override per component in `app.config.ts`.
- **Tinted surfaces** (the Warm preset's signature): Nuxt UI's `outline` cards and CTA use the canvas colour, so nothing is tinted. Use `variant="subtle"` (elevated tint plus a hairline ring) or `variant="soft"` (the tint alone, faint in light mode) on `UCard` and `UPageCTA` where the preset asks for soft surfaces. Measured on the Warm ramp: `soft` is the canvas at 0.975 and the surface at about 0.965 effective in light mode, and 0.20 against 0.24 in dark.
- Body size stays Tailwind's 16px; record it rather than raising it (the type scale in the preset is about the display sizes).
- **Radius is a formula for most of it.** Nuxt UI derives every radius from `--ui-radius`: inputs and buttons use 1.5×, cards and modals 2×, and the large surfaces (the CTA box) 3×. Set `--ui-radius` to the preset's input radius ÷ 1.5 and the card follows:

  | Preset (input · card) | `--ui-radius` | Input & button | Card & modal | CTA box |
  |---|---|---|---|---|
  | Crisp & technical (6 · 8) | `0.25rem` | 6 | 8 | 12 |
  | Warm & friendly (12 · 16) | `0.5rem` | 12 | 16 | 24 |
  | Editorial & bold (4 · 4) | `0.1667rem` | 4 | 5.3 | 8 |
  | Dark & atmospheric (10 · 14) | `0.4167rem` | 10 | 13.3 | 20 |

  A value like `0.75rem` gives 18px buttons and a 36px CTA box. The preset tables list a modal radius too (12, 24, 8, 20); modals follow the card (2×), so reach a larger modal radius only by overriding the modal's content slot in `app.config.ts`, or record the measured value in DESIGN.md §5. The same applies to weights and any other value the components fix.

Rules for the landing:
- **Tokens only.** After this, no colour or `font-family` appears in a component outside the token files (`anti-slop.md` P0).
- **Fonts are bundled, not fetched.** Add the font as a package: `pnpm add @fontsource-variable/<font>` (variable fonts, family `'<Font> Variable'`; web, desktop and the Expo/Flutter equivalents `expo-font` / Flutter assets). The package's plain import carries the weight axis; import a font's extra-axis file (e.g. optical size) only when the design needs it. Use the package the template already has if there is one. No runtime CDN link (no Google Fonts `<link>`); if an offline install is impossible, keep the template's font and record the intended one in DESIGN.md §4.
- **Assets carry colour too.** Update the favicon and any other shipped SVG or image that hard-codes the template's green (`public/favicon.svg`) to the new accent, so the brand is consistent beyond the CSS.
- **Verify stays green.** Run `sdlc verify` after the edit; a theme change must not touch tests or logic.
