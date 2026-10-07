import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { describeError } from '@/api/errors';
import { useAuthService } from '@/auth/auth-context';
import { Button, StateMessage } from '@/ui/components';
import { useTheme } from '@/theme';

// Target of the deep link <scheme>://auth/magic?token=… : exchanges the one-time token for a session.
export function MagicLinkScreen() {
  const t = useTheme();
  const router = useRouter();
  const auth = useAuthService();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [error, setError] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;
    if (started.current === token) return; // a magic token is single-use: never exchange it twice
    started.current = token;
    auth.exchangeMagicToken(token).then(
      () => router.replace('/'),
      (e: unknown) => setError(describeError(e, "Couldn't sign you in with that link. It may have expired or been used already.")),
    );
  }, [token, auth, router]);

  const message = token ? error : 'This sign-in link is incomplete.';
  if (message) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.background }}>
        <StateMessage
          title="Link didn't work"
          message={message}
          action={<Button title="Back to sign in" onPress={() => router.replace('/sign-in')} />}
        />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.background }}>
      <ActivityIndicator accessibilityLabel="Signing you in" />
    </View>
  );
}
