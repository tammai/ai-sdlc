import 'package:dio/dio.dart';

import 'package:__APP_SNAKE__/features/notes/domain/note.dart';

/// Notes data source. Screens and providers depend on this interface so tests
/// can substitute a fake without touching the network.
abstract interface class NotesRepository {
  /// `GET /v1/notes` — newest first.
  Future<List<Note>> list();

  /// `POST /v1/notes` — returns the created note (201).
  Future<Note> create(NewNote input);
}

class DioNotesRepository implements NotesRepository {
  DioNotesRepository(this._dio);

  /// Contract allows 1..100; one page is enough for the starter screen.
  static const int pageSize = 50;

  final Dio _dio;

  @override
  Future<List<Note>> list() async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/v1/notes',
      queryParameters: <String, dynamic>{'limit': pageSize},
    );
    final items = response.data?['items'];
    if (items is! List<dynamic>) {
      throw const FormatException('Malformed NotePage: "items" missing');
    }
    return <Note>[
      for (final item in items) Note.fromJson(item as Map<String, dynamic>),
    ];
  }

  @override
  Future<Note> create(NewNote input) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/v1/notes',
      data: input.toJson(),
    );
    final data = response.data;
    if (data == null) {
      throw const FormatException('Malformed Note: empty response body');
    }
    return Note.fromJson(data);
  }
}
