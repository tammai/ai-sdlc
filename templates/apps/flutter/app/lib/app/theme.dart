import 'package:material_ui/material_ui.dart';

/// Spacing tokens on the 4/8 scale, exposed through [ThemeData.extensions].
class AppSpacing extends ThemeExtension<AppSpacing> {
  const AppSpacing({
    required this.xs,
    required this.sm,
    required this.md,
    required this.lg,
    required this.xl,
  });

  static const regular = AppSpacing(xs: 4, sm: 8, md: 16, lg: 24, xl: 32);

  final double xs;
  final double sm;
  final double md;
  final double lg;
  final double xl;

  @override
  AppSpacing copyWith({
    double? xs,
    double? sm,
    double? md,
    double? lg,
    double? xl,
  }) {
    return AppSpacing(
      xs: xs ?? this.xs,
      sm: sm ?? this.sm,
      md: md ?? this.md,
      lg: lg ?? this.lg,
      xl: xl ?? this.xl,
    );
  }

  @override
  AppSpacing lerp(covariant ThemeExtension<AppSpacing>? other, double t) {
    if (other is! AppSpacing) return this;
    double mix(double a, double b) => a + (b - a) * t;
    return AppSpacing(
      xs: mix(xs, other.xs),
      sm: mix(sm, other.sm),
      md: mix(md, other.md),
      lg: mix(lg, other.lg),
      xl: mix(xl, other.xl),
    );
  }
}

abstract final class AppTheme {
  // Brand seed: the only literal color in the app. Everything else derives
  // from the generated ColorScheme.
  static const Color seed = Color(0xFF3F51B5);

  /// Minimum interactive size (Material / WCAG touch target).
  static const double minTapTarget = 48;

  static ThemeData light() => _build(Brightness.light);

  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final scheme = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: brightness,
    );
    return ThemeData(
      colorScheme: scheme,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      extensions: const <ThemeExtension<dynamic>>[AppSpacing.regular],
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(64, minTapTarget),
        ),
      ),
    );
  }
}

extension AppThemeContext on BuildContext {
  AppSpacing get spacing =>
      Theme.of(this).extension<AppSpacing>() ?? AppSpacing.regular;
}
