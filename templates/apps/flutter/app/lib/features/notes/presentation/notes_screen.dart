import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';

import 'package:__APP_SNAKE__/app/theme.dart';
import 'package:__APP_SNAKE__/features/notes/domain/note.dart';
import 'package:__APP_SNAKE__/features/notes/presentation/notes_providers.dart';

class NotesScreen extends ConsumerWidget {
  const NotesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final spacing = context.spacing;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notes'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Refresh notes',
            onPressed: () => ref.invalidate(notesProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Padding(
              padding: EdgeInsets.all(spacing.md),
              child: const NoteForm(),
            ),
            const Divider(height: 1),
            const Expanded(child: _NotesList()),
          ],
        ),
      ),
    );
  }
}

class _NotesList extends ConsumerWidget {
  const _NotesList();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notes = ref.watch(notesProvider);

    if (notes.isLoading) {
      return const Center(
        child: CircularProgressIndicator(semanticsLabel: 'Loading notes'),
      );
    }
    if (notes.hasError) {
      return _Message(
        icon: Icons.cloud_off,
        text: 'Could not load notes.',
        action: FilledButton.tonal(
          onPressed: () => ref.invalidate(notesProvider),
          child: const Text('Retry'),
        ),
      );
    }

    final items = notes.value ?? const <Note>[];
    if (items.isEmpty) {
      return const _Message(
        icon: Icons.notes,
        text: 'No notes yet. Add your first one above.',
      );
    }

    final localizations = MaterialLocalizations.of(context);
    return ListView.separated(
      itemCount: items.length,
      separatorBuilder: (context, index) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final note = items[index];
        final date = localizations.formatMediumDate(note.createdAt.toLocal());
        return ListTile(
          title: Text(note.title),
          subtitle: Text(
            note.body.isEmpty ? date : '${note.body}\n$date',
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
        );
      },
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text, this.action});

  final IconData icon;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final spacing = context.spacing;
    final trailing = action;
    return Center(
      child: Padding(
        padding: EdgeInsets.all(spacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            ExcludeSemantics(
              child: Icon(
                icon,
                size: spacing.xl * 1.5,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            SizedBox(height: spacing.md),
            Text(
              text,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge,
            ),
            if (trailing != null) ...<Widget>[
              SizedBox(height: spacing.md),
              trailing,
            ],
          ],
        ),
      ),
    );
  }
}

class NoteForm extends ConsumerStatefulWidget {
  const NoteForm({super.key});

  @override
  ConsumerState<NoteForm> createState() => _NoteFormState();
}

class _NoteFormState extends ConsumerState<NoteForm> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _body = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final form = _formKey.currentState;
    if (form == null || !form.validate()) return;

    setState(() => _submitting = true);
    try {
      await ref
          .read(notesProvider.notifier)
          .create(NewNote(title: _title.text.trim(), body: _body.text.trim()));
      if (!mounted) return;
      _title.clear();
      _body.clear();
    } on Exception {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not save the note. Try again.')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final spacing = context.spacing;
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          TextFormField(
            controller: _title,
            enabled: !_submitting,
            decoration: const InputDecoration(labelText: 'Title'),
            maxLength: NewNote.titleMaxLength,
            textInputAction: TextInputAction.next,
            validator: NewNote.validateTitle,
          ),
          SizedBox(height: spacing.xs),
          TextFormField(
            controller: _body,
            enabled: !_submitting,
            decoration: const InputDecoration(labelText: 'Body (optional)'),
            minLines: 1,
            maxLines: 4,
            validator: NewNote.validateBody,
          ),
          SizedBox(height: spacing.md),
          FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: const Icon(Icons.add),
            label: const Text('Add note'),
          ),
        ],
      ),
    );
  }
}
