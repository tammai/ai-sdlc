import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mocktail/mocktail.dart';

import 'package:__APP_SNAKE__/features/notes/domain/note.dart';
import 'package:__APP_SNAKE__/features/notes/presentation/notes_screen.dart';

import '../../support/mocks.dart';

void main() {
  late MockNotesRepository repo;

  setUpAll(() {
    registerFallbackValue(const NewNote(title: 'fallback'));
  });

  setUp(() {
    repo = MockNotesRepository();
  });

  Future<void> pumpScreen(WidgetTester tester) {
    return tester.pumpWidget(
      withRepository(repo, child: testApp(const NotesScreen())),
    );
  }

  testWidgets('shows a spinner while loading', (tester) async {
    final pending = Completer<List<Note>>();
    when(() => repo.list()).thenAnswer((_) => pending.future);

    await pumpScreen(tester);

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows the empty state with accessible tap targets', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    when(() => repo.list()).thenAnswer((_) async => <Note>[]);

    await pumpScreen(tester);
    await tester.pumpAndSettle();

    expect(find.text('No notes yet. Add your first one above.'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    semantics.dispose();
  });

  testWidgets('shows an error with a working retry', (tester) async {
    var calls = 0;
    when(() => repo.list()).thenAnswer((_) async {
      calls++;
      if (calls == 1) throw Exception('network down');
      return <Note>[sampleNote()];
    });

    await pumpScreen(tester);
    await tester.pumpAndSettle();

    expect(find.text('Could not load notes.'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(find.text('Could not load notes.'), findsNothing);
    expect(find.text('First note'), findsOneWidget);
    expect(calls, 2);
  });

  testWidgets('validates the title before creating', (tester) async {
    when(() => repo.list()).thenAnswer((_) async => <Note>[]);

    await pumpScreen(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add note'));
    await tester.pumpAndSettle();

    expect(find.text('Title is required'), findsOneWidget);
    verifyNever(() => repo.create(any()));
  });

  testWidgets('creates a note and prepends it to the list', (tester) async {
    when(() => repo.list()).thenAnswer((_) async => <Note>[]);
    when(() => repo.create(any())).thenAnswer((invocation) async {
      final input = invocation.positionalArguments.first as NewNote;
      return sampleNote(id: 'n2', title: input.title);
    });

    await pumpScreen(tester);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Title'),
      '  Buy milk ',
    );
    await tester.tap(find.text('Add note'));
    await tester.pumpAndSettle();

    final captured =
        verify(() => repo.create(captureAny())).captured.single as NewNote;
    expect(captured.title, 'Buy milk');
    expect(find.text('Buy milk'), findsOneWidget);
    expect(find.text('No notes yet. Add your first one above.'), findsNothing);
  });
}
