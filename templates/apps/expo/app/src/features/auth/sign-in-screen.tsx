import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { describeError } from '@/api/errors';
import { useAuthService } from '@/auth/auth-context';
import { signInWithOidc } from '@/auth/oidc';
import { Button, Field, Heading, SkeletonRows, StateMessage } from '@/ui/components';
import { font, space, useTheme } from '@/theme';

import { validateEmail } from './validation';

WebBrowser.maybeCompleteAuthSession();

// Renders only what GET /v1/auth/providers says is enabled.
export function SignInScreen() {
  const t = useTheme();
  const auth = useAuthService();
  const router = useRouter();
  const providers = useQuery({ queryKey: ['auth', 'providers'], queryFn: () => auth.getProviders() });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // which action is running
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  function checkEmail(): boolean {
    const message = validateEmail(email);
    setEmailError(message);
    return !message;
  }

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(describeError(e, action === 'link' ? "Couldn't send the link." : "Couldn't sign you in."));
    } finally {
      setBusy(null);
    }
  }

  if (providers.isPending) return <SkeletonRows label="Loading sign-in options" />;

  if (providers.isError) {
    return (
      <StateMessage
        title="Can't reach the server"
        message="Check your connection and try again."
        action={<Button title="Try again" onPress={() => void providers.refetch()} busy={providers.isRefetching} />}
      />
    );
  }

  const p = providers.data;
  const anything = p.password || p.magicLink || p.oidc.length > 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, gap: space.xl, flexGrow: 1, justifyContent: 'center' }}>
        <Heading>Sign in</Heading>

        {!anything ? (
          <StateMessage title="Sign-in is turned off" message="This server has no sign-in method enabled. Ask an administrator to enable one." />
        ) : null}

        {p.password || p.magicLink ? (
          <Field
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (emailError) setEmailError(null);
            }}
            onBlur={() => email && checkEmail()}
            error={emailError}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            textContentType="emailAddress"
          />
        ) : null}

        {p.password ? (
          <View style={{ gap: space.lg }}>
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
            />
            <Button
              title="Sign in"
              busy={busy === 'password'}
              disabled={busy !== null}
              onPress={() => {
                if (!checkEmail()) return;
                void run('password', () => auth.signInWithPassword(email.trim(), password));
              }}
            />
          </View>
        ) : null}

        {p.password && p.registration ? (
          <Button title="Create an account" variant="secondary" disabled={busy !== null} onPress={() => router.push('/register')} />
        ) : null}

        {p.magicLink ? (
          <View style={{ gap: space.md }}>
            <Button
              title="Email me a link"
              variant="secondary"
              busy={busy === 'link'}
              disabled={busy !== null}
              onPress={() => {
                if (!checkEmail()) return;
                void run('link', async () => {
                  await auth.requestMagicLink(email.trim());
                  setNotice('If that email has an account, a sign-in link is on its way. Open it on this device.');
                });
              }}
            />
          </View>
        ) : null}

        {p.oidc.length > 0 ? (
          <View style={{ gap: space.md }}>
            {p.password || p.magicLink ? <Text style={{ color: t.textMuted, fontSize: font.small, textAlign: 'center' }}>or</Text> : null}
            {p.oidc.map((o) => (
              <Button
                key={o.id}
                title={`Continue with ${o.name}`}
                variant="secondary"
                busy={busy === `oidc:${o.id}`}
                disabled={busy !== null}
                onPress={() => void run(`oidc:${o.id}`, async () => void (await signInWithOidc(o.id, auth)))}
              />
            ))}
          </View>
        ) : null}

        <View accessibilityLiveRegion="polite">
          {error ? <Text accessibilityRole="alert" style={{ color: t.danger, fontSize: font.body }}>{error}</Text> : null}
          {notice ? <Text style={{ color: t.text, fontSize: font.body }}>{notice}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
