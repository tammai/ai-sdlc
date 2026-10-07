import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';

import { Button, SkeletonRows, StateMessage } from '@/ui/components';
import { font, radius, space, useTheme } from '@/theme';

import { useNotes, type Note } from './api';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function NoteRow({ note }: { note: Note }) {
  const t = useTheme();
  return (
    <View
      accessible
      style={{
        backgroundColor: t.surface,
        borderColor: t.border,
        borderWidth: 1,
        borderRadius: radius.card,
        padding: space.lg,
        gap: space.xs,
      }}
    >
      <Text style={{ color: t.text, fontSize: font.body, fontWeight: '600' }}>{note.title}</Text>
      {note.body ? (
        <Text numberOfLines={3} style={{ color: t.text, fontSize: font.body, lineHeight: 24 }}>
          {note.body}
        </Text>
      ) : null}
      <Text style={{ color: t.textMuted, fontSize: font.small }}>{formatDate(note.createdAt)}</Text>
    </View>
  );
}

export function NotesScreen() {
  const t = useTheme();
  const router = useRouter();
  const notes = useNotes();
  const items = notes.data?.pages.flatMap((p) => p.items) ?? [];

  if (notes.isPending) return <SkeletonRows label="Loading notes" />;

  if (notes.isError && items.length === 0) {
    return (
      <StateMessage
        title="Couldn't load your notes"
        message="Check your connection and try again. Your notes are safe."
        action={<Button title="Try again" onPress={() => void notes.refetch()} busy={notes.isRefetching} />}
      />
    );
  }

  if (items.length === 0) {
    return (
      <StateMessage
        title="No notes yet"
        message="Create your first note to keep something worth remembering."
        action={<Button title="New note" onPress={() => router.push('/new')} />}
      />
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(n) => n.id}
      renderItem={({ item }) => <NoteRow note={item} />}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      style={{ backgroundColor: t.background }}
      refreshControl={<RefreshControl refreshing={notes.isRefetching && !notes.isFetchingNextPage} onRefresh={() => void notes.refetch()} />}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (notes.hasNextPage && !notes.isFetchingNextPage) void notes.fetchNextPage();
      }}
      ListFooterComponent={notes.isFetchingNextPage ? <ActivityIndicator accessibilityLabel="Loading more notes" /> : null}
    />
  );
}
