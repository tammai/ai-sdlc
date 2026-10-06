import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:__APP_SNAKE__/features/notes/data/notes_repository.dart';
import 'package:__APP_SNAKE__/features/notes/domain/note.dart';

import '../../support/fake_http_adapter.dart';

const _noteJson = <String, dynamic>{
  'id': '6f1c2a3e-0000-4000-8000-000000000001',
  'title': 'First note',
  'body': 'Hello',
  'createdAt': '2026-01-02T03:04:05Z',
};

void main() {
  group('DioNotesRepository.list', () {
    test('GETs /v1/notes with a limit and maps the NotePage', () async {
      final adapter = FakeHttpAdapter(
        (_) => jsonResponse(<String, dynamic>{
          'items': <Object>[_noteJson],
        }, 200),
      );
      final repo = DioNotesRepository(fakeDio(adapter));

      final notes = await repo.list();

      expect(notes, hasLength(1));
      expect(notes.single.title, 'First note');
      expect(notes.single.body, 'Hello');
      expect(notes.single.createdAt, DateTime.utc(2026, 1, 2, 3, 4, 5));

      final request = adapter.requests.single;
      expect(request.method, 'GET');
      expect(request.path, '/v1/notes');
      expect(request.queryParameters['limit'], DioNotesRepository.pageSize);
    });

    test('throws a DioException on a problem response', () async {
      final adapter = FakeHttpAdapter(
        (_) => jsonResponse(
          <String, dynamic>{'title': 'Internal Server Error', 'status': 500},
          500,
          contentType: 'application/problem+json',
        ),
      );
      final repo = DioNotesRepository(fakeDio(adapter));

      await expectLater(repo.list(), throwsA(isA<DioException>()));
    });

    test('throws FormatException when items is missing', () async {
      final adapter = FakeHttpAdapter(
        (_) => jsonResponse(<String, dynamic>{}, 200),
      );
      final repo = DioNotesRepository(fakeDio(adapter));

      await expectLater(repo.list(), throwsA(isA<FormatException>()));
    });
  });

  group('DioNotesRepository.create', () {
    test('POSTs the NewNote body and maps the created Note', () async {
      final adapter = FakeHttpAdapter((_) => jsonResponse(_noteJson, 201));
      final repo = DioNotesRepository(fakeDio(adapter));

      final note = await repo.create(
        const NewNote(title: 'First note', body: 'Hello'),
      );

      expect(note.id, _noteJson['id']);
      final request = adapter.requests.single;
      expect(request.method, 'POST');
      expect(request.path, '/v1/notes');
      expect(request.data, <String, dynamic>{
        'title': 'First note',
        'body': 'Hello',
      });
    });

    test('omits an empty body', () {
      expect(const NewNote(title: 'Only title').toJson(), <String, dynamic>{
        'title': 'Only title',
      });
    });
  });
}
