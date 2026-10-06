import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:__APP_SNAKE__/features/notes/presentation/notes_screen.dart';

abstract final class AppRoutes {
  static const notes = '/';
}

final routerProvider = Provider<GoRouter>((ref) {
  final router = GoRouter(
    initialLocation: AppRoutes.notes,
    routes: <RouteBase>[
      GoRoute(
        path: AppRoutes.notes,
        builder: (context, state) => const NotesScreen(),
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
