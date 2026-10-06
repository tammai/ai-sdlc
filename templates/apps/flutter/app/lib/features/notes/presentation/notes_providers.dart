import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:__APP_SNAKE__/core/api_client.dart';
import 'package:__APP_SNAKE__/features/notes/data/notes_repository.dart';
import 'package:__APP_SNAKE__/features/notes/domain/note.dart';

final notesRepositoryProvider = Provider<NotesRepository>(
  (ref) => DioNotesRepository(ref.watch(dioProvider)),
);

final notesProvider = AsyncNotifierProvider<NotesController, List<Note>>(
  NotesController.new,
);

class NotesController extends AsyncNotifier<List<Note>> {
  @override
  Future<List<Note>> build() => ref.watch(notesRepositoryProvider).list();

  /// Creates a note and prepends it to the list. Throws on failure so the
  /// form can report the error; the list state is left untouched.
  Future<void> create(NewNote input) async {
    final created = await ref.read(notesRepositoryProvider).create(input);
    if (!ref.mounted) return;
    final current = state.value ?? const <Note>[];
    state = AsyncValue.data(<Note>[created, ...current]);
  }
}
