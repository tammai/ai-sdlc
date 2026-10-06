// Domain models for the notes slice, shaped by `Note` and `NewNote` in
// contracts/openapi.yaml. Replace with the generated client's models (mapped
// in the repository) once lib/api/gen exists.

class Note {
  const Note({
    required this.id,
    required this.title,
    required this.body,
    required this.createdAt,
  });

  factory Note.fromJson(Map<String, dynamic> json) {
    return Note(
      id: json['id'] as String,
      title: json['title'] as String,
      body: json['body'] as String? ?? '',
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  final String id;
  final String title;
  final String body;
  final DateTime createdAt;

  @override
  bool operator ==(Object other) =>
      other is Note &&
      other.id == id &&
      other.title == title &&
      other.body == body &&
      other.createdAt == createdAt;

  @override
  int get hashCode => Object.hash(id, title, body, createdAt);
}

class NewNote {
  const NewNote({required this.title, this.body = ''});

  static const int titleMaxLength = 200;
  static const int bodyMaxLength = 10000;

  final String title;
  final String body;

  /// Mirrors `NewNote.title` in the contract: required, 1..200 chars.
  static String? validateTitle(String? value) {
    final title = value?.trim() ?? '';
    if (title.isEmpty) return 'Title is required';
    if (title.length > titleMaxLength) {
      return 'Title must be at most $titleMaxLength characters';
    }
    return null;
  }

  /// Mirrors `NewNote.body` in the contract: optional, up to 10000 chars.
  static String? validateBody(String? value) {
    if ((value ?? '').length > bodyMaxLength) {
      return 'Body must be at most $bodyMaxLength characters';
    }
    return null;
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
    'title': title,
    if (body.isNotEmpty) 'body': body,
  };
}
