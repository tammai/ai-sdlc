# Profile: flutter — mobile client of the Go API

**Stack:** Flutter (current stable) · Material 3 with a seeded `ColorScheme` · Riverpod (with `riverpod_generator`) · `go_router` · Dio + client generated from `contracts/openapi.yaml` (`openapi-generator` `dart-dio`) · `freezed` + `json_serializable` · `flutter_secure_storage` for tokens · `drift` only if offline data is a requirement · `very_good_analysis` lints.

## Layout
```
lib/
  main_dev.dart / main_staging.dart / main_prod.dart   flavors → AppConfig (base URL, flags)
  app/            router.dart, theme.dart (ThemeData from tokens), app.dart
  features/<feature>/
    data/         repository (wraps generated API client; maps DTO → domain)
    domain/       freezed models, pure logic
    presentation/ screens, widgets, providers (@riverpod)
  api/gen/        generated client (protected — regenerate, never edit)
  core/           auth (token refresh interceptor), error mapping, l10n
test/  integration_test/
```

## Rules
- Contract changes come from `contracts/openapi.yaml`; regenerate the client, never hand-write DTOs for API types.
- Auth: OAuth 2.1 / OIDC with PKCE (or the API's token endpoint); access token in memory, refresh token in `flutter_secure_storage`; a Dio interceptor refreshes once and retries; never log tokens.
- State: one `AsyncValue` per screen data source; every screen handles loading, error (with retry) and empty. No business logic in widgets.
- Theming from tokens: `ColorScheme.fromSeed` + text theme; no hard-coded colors/sizes in widgets. Touch targets ≥ 48dp. Support dynamic type and dark mode.
- Navigation via `go_router` typed routes; deep links declared once.
- i18n via `flutter_localizations` + ARB files from day one.

## Tests & verify
Unit tests for domain + repositories (mock the generated client at the repository boundary), widget tests for screens (golden tests for key screens), `integration_test` for 1–3 critical flows against a dev API. Verify preset: build_runner drift check · `flutter analyze` · `flutter test`.

## Deploy
Builds per flavor in CI (Codemagic/GitHub Actions + fastlane). Internal tracks (TestFlight internal, Play internal) the agent may trigger from CI; store release/promotion is gated (`fastlane … release|deliver|supply`). Rollback: halt staged rollout + hotfix build; use remote config flags for kill switches.

## Scaffold
`flutter create --org <reverse-domain> --platforms ios,android <name>` → add deps above; `analysis_options.yaml` includes `very_good_analysis`; flavors; `build.yaml`; a script `tool/gen_api.sh` to regenerate the client.

## CLAUDE.md snippet
- Flutter: Riverpod (generator), go_router, Dio + generated OpenAPI client in lib/api/gen (never edit; regenerate), freezed models.
- Feature-first folders data/domain/presentation. Every screen: loading/error/empty. Theme from tokens; no hard-coded colors.
- `dart run build_runner build --delete-conflicting-outputs` after model changes.
