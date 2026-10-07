import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { AuthProvider, useAuthState } from '@/auth/auth-context';
import { useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

function RootStack() {
  const t = useTheme();
  const { status } = useAuthState();

  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null; // splash stays up until the stored session is read

  const base = t.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: t.background, card: t.surface, text: t.text, border: t.border, primary: t.primary },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShadowVisible: false }}>
        <Stack.Protected guard={status === 'signedIn'}>
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ title: 'Create account' }} />
        </Stack.Protected>
        {/* Deep-link targets stay reachable in every auth state. */}
        <Stack.Screen name="auth/magic" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RootStack />
      </AuthProvider>
    </QueryClientProvider>
  );
}
