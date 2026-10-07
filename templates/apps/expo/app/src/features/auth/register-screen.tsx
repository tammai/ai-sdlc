import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';

import { describeError } from '@/api/errors';
import { useAuthService } from '@/auth/auth-context';
import { Button, Field, SkeletonRows, StateMessage } from '@/ui/components';
import { space, useTheme } from '@/theme';

import { PASSWORD_MIN, validateEmail, validateNewPassword } from './validation';

// Native sign-up: POST /v1/auth/register, then the password grant. Only reachable when providers.registration is true.
export function RegisterScreen() {
  const t = useTheme();
  const router = useRouter();
  const auth = useAuthService();
  const providers = useQuery({ queryKey: ['auth', 'providers'], queryFn: () => auth.getProviders() });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailError = touched.email ? validateEmail(email) : null;
  const passwordError = touched.password ? validateNewPassword(password) : null;

  async function submit() {
    setTouched({ email: true, password: true });
    if (validateEmail(email) || validateNewPassword(password)) return;
    setBusy(true);
    setError(null);
    try {
      await auth.register({ email: email.trim(), password, ...(name.trim() ? { name: name.trim() } : {}) });
      // signed in: the root layout swaps to the notes stack
    } catch (e) {
      setError(describeError(e, "Couldn't create your account."));
    } finally {
      setBusy(false);
    }
  }

  if (providers.isPending) return <SkeletonRows label="Loading sign-up options" />;

  if (providers.isError) {
    return (
      <StateMessage
        title="Can't reach the server"
        message="Check your connection and try again."
        action={<Button title="Try again" onPress={() => void providers.refetch()} busy={providers.isRefetching} />}
      />
    );
  }

  if (!providers.data.registration) {
    return (
      <StateMessage
        title="Sign-up is closed"
        message="This server is not accepting new accounts. Ask an administrator for an invitation."
        action={<Button title="Back to sign in" onPress={() => router.back()} />}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
        <Field label="Name (optional)" value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={200} />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          onBlur={() => setTouched((s) => ({ ...s, email: true }))}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          textContentType="emailAddress"
        />
        <Field
          label="Password"
          hint={`At least ${PASSWORD_MIN} characters`}
          value={password}
          onChangeText={setPassword}
          onBlur={() => setTouched((s) => ({ ...s, password: true }))}
          error={passwordError}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {error ? (
          <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ color: t.danger, fontSize: 16 }}>
            {error}
          </Text>
        ) : null}
        <Button title="Create account" busy={busy} onPress={() => void submit()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
