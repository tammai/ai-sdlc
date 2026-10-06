# Platform mappings — where tokens and rules live per stack

Extend the adopted system; never build a parallel one. One semantic token layer (surface, text, border, primary, status) switches between light and dark; primitives never do.

## Nuxt UI (web, Tauri-Vue)
- Tokens: `app/assets/css/main.css` — `@import "tailwindcss"; @import "@nuxt/ui";` then `@theme { --font-sans: …; --color-<brand>-50…950: … }` (OKLCH). Semantic mapping and component defaults in `app.config.ts` → `ui: { colors: { primary: '<brand>', neutral: '<gray>' }, <component>: { slots/variants/defaultVariants } }`.
- Use `UButton`, `UInput`, `UFormField` (label/hint/error wired for a11y), `UForm` with a Zod/Valibot schema, `UTable`, `UModal`/`USlideover` (focus handled), `UToast` via `useToast()`, `UEmpty`/skeleton (`USkeleton`). Prefer variants (`color`, `variant`, `size`) to custom classes.
- Dark mode: `@nuxtjs/color-mode` (built into Nuxt UI) — design both; check with `useColorMode()`.
- Icons: Iconify via `UIcon` with one collection (e.g. `i-lucide-*`).

## shadcn/ui (web, Tauri-React)
- Tokens: CSS variables in `globals.css` (`:root` and `.dark`: `--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--ring`, `--radius`, chart colors) mapped in Tailwind v4 via `@theme inline`. Change variables, not component internals; extend with `cva` variants in `components/ui/*`.
- Forms: `react-hook-form` + Zod with shadcn `Form` components (label/description/message wired). Dialogs: Radix-based `Dialog`/`Sheet` (focus handled). Toasts: `sonner`. Tables: TanStack Table with shadcn `Table`.
- Dark mode: `next-themes` (class strategy). Icons: `lucide-react` only.

## Flutter (Material 3)
- Tokens: `ThemeData(useMaterial3: true, colorScheme: ColorScheme.fromSeed(seedColor: …, brightness: …), textTheme: …)` in `lib/app/theme.dart`; extra tokens via `ThemeExtension<T>` (spacing, radii, status colors). No `Color(0x…)`/magic numbers in widgets — read from `Theme.of(context)`.
- Spacing constants in one `Gap`/`Insets` class on the 4/8 scale. Targets ≥ 48dp (`MaterialTapTargetSize.padded`). `SafeArea`, `MediaQuery.textScalerOf` respected, layouts adapt by width (`LayoutBuilder`: compact < 600 ≤ medium < 840 ≤ expanded).
- Semantics: `Semantics(label:)` / `tooltip` on icon buttons; `ExcludeSemantics` for decoration; test with `tester.ensureSemantics()` and `meetsGuideline(textContrastGuideline)` / `androidTapTargetGuideline` in widget tests.
- Navigation: `NavigationBar` (compact) / `NavigationRail` (medium+); bottom sheets for short tasks; one sheet at a time.
- Golden tests for key screens in light/dark and large text.

## Tauri (desktop)
- Frontend tokens per Nuxt UI or shadcn above. Follow desktop conventions: every command reachable from the native menu (`tauri::menu`) with standard shortcuts (Cmd on macOS, Ctrl elsewhere); context menus on right-click; system window chrome unless the design has a strong reason (then implement drag regions and window controls correctly per OS).
- Hover states matter (pointer devices); dense layouts acceptable; minimum window size defined and tested.
- Respect `prefers-color-scheme` and `prefers-reduced-motion` (webview reflects the OS setting). Blur/translucency only on floating layers (popovers, sidebars), never behind body text.

## Verification tooling per stack
| Stack | Visual | Accessibility |
|---|---|---|
| Nuxt / Next / Tauri frontend | Playwright screenshots at 375 / 768 / 1280, light + dark | `@axe-core/playwright` on changed routes; keyboard walk-through |
| Flutter | golden tests (`matchesGoldenFile`), light/dark, text scale 2.0 | `meetsGuideline(...)` matchers, semantics tree checks |
