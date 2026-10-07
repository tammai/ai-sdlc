import { Stack, useRouter } from 'expo-router';

import { useAuthService } from '@/auth/auth-context';
import { IconButton } from '@/ui/components';

export default function AppLayout() {
  const router = useRouter();
  const auth = useAuthService();
  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Notes',
          headerRight: () => (
            <>
              <IconButton name="add" label="New note" onPress={() => router.push('/new')} />
              <IconButton name="log-out-outline" label="Sign out" onPress={() => void auth.signOut()} />
            </>
          ),
        }}
      />
      <Stack.Screen name="new" options={{ title: 'New note', presentation: 'modal' }} />
    </Stack>
  );
}
