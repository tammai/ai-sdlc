import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import 'package:__APP_SNAKE__/app/app.dart';

void main() {
  runApp(
    ProviderScope(
      // Riverpod 3 retries failed providers automatically; screens offer an
      // explicit Retry instead, so the error state stays visible.
      retry: (_, _) => null,
      child: const App(),
    ),
  );
}
