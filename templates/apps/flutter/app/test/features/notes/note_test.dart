import 'package:flutter_test/flutter_test.dart';

import 'package:__APP_SNAKE__/features/notes/domain/note.dart';

void main() {
  group('NewNote.validateTitle', () {
    test('requires a non-blank title', () {
      expect(NewNote.validateTitle(null), 'Title is required');
      expect(NewNote.validateTitle(''), 'Title is required');
      expect(NewNote.validateTitle('   '), 'Title is required');
    });

    test('accepts up to 200 characters', () {
      expect(NewNote.validateTitle('a' * 200), isNull);
      expect(NewNote.validateTitle('a' * 201), isNotNull);
    });
  });

  test('NewNote.validateBody caps the body at 10000 characters', () {
    expect(NewNote.validateBody(null), isNull);
    expect(NewNote.validateBody('b' * 10000), isNull);
    expect(NewNote.validateBody('b' * 10001), isNotNull);
  });

  test('Note.fromJson treats a missing body as empty', () {
    final note = Note.fromJson(<String, dynamic>{
      'id': 'n1',
      'title': 'T',
      'createdAt': '2026-01-01T00:00:00Z',
    });
    expect(note.body, isEmpty);
  });
}
