import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mocktail/mocktail.dart';

import 'package:__APP_SNAKE__/app/theme.dart';
import 'package:__APP_SNAKE__/features/notes/data/notes_repository.dart';
import 'package:__APP_SNAKE__/features/notes/domain/note.dart';
import 'package:__APP_SNAKE__/features/notes/presentation/notes_providers.dart';

class MockNotesRepository extends Mock implements NotesRepository {}

Note sampleNote({String id = 'n1', String title = 'First note'}) {
  return Note(
    id: id,
    title: title,
    body: 'Body text',
    createdAt: DateTime.utc(2026, 1, 2),
  );
}

/// Wraps [child] in a ProviderScope whose repository is [repo] and whose
/// automatic retry is off, so error states are deterministic.
Widget withRepository(NotesRepository repo, {required Widget child}) {
  return ProviderScope(
    overrides: [notesRepositoryProvider.overrideWithValue(repo)],
    retry: (_, _) => null,
    child: child,
  );
}

Widget testApp(Widget home) => MaterialApp(theme: AppTheme.light(), home: home);
