/// Build-time configuration. Override with
/// `flutter run --dart-define=API_BASE=https://api.example.com`.
abstract final class AppConfig {
  static const String apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: '__API_URL__',
  );
}
