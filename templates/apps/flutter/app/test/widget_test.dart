// App smoke test. Kept at this path on purpose: `flutter create .` skips
// existing files, so its counter-app widget_test.dart is never generated here.
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:__APP_SNAKE__/app/app.dart';
import 'package:__APP_SNAKE__/features/notes/domain/note.dart';

import 'support/mocks.dart';

void main() {
  testWidgets('App boots into the notes screen', (tester) async {
    final repo = MockNotesRepository();
    when(() => repo.list()).thenAnswer((_) async => <Note>[sampleNote()]);

    await tester.pumpWidget(withRepository(repo, child: const App()));
    await tester.pumpAndSettle();

    expect(find.text('Notes'), findsOneWidget);
    expect(find.text('First note'), findsOneWidget);
  });
}
