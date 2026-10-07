import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { font, MIN_TARGET, radius, space, useTheme } from '@/theme';

export function Heading({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={{ color: t.text, fontSize: font.heading, lineHeight: 30, fontWeight: '700' }}>
      {children}
    </Text>
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  busy?: boolean;
  disabled?: boolean;
}

// Verb + noun titles ("Create note"). `busy` shows progress and blocks double submit.
export function Button({ title, onPress, variant = 'primary', busy, disabled }: ButtonProps) {
  const t = useTheme();
  const primary = variant === 'primary';
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? t.primary : t.surface,
          borderColor: primary ? t.primary : t.border,
          opacity: off ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? t.onPrimary : t.text} /> : null}
      <Text style={{ color: primary ? t.onPrimary : t.text, fontSize: font.body, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

// Icon-only button: always needs an accessible name.
export function IconButton({
  name,
  label,
  onPress,
}: {
  name: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.icon, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={name} size={24} color={t.text} accessible={false} />
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
}

// Visible label above the input (a placeholder is not a label); the error is announced politely and tied to the field.
export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, error, hint, style, ...input }, ref) {
  const t = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ color: t.text, fontSize: font.small, fontWeight: '600' }}>{label}</Text>
      {hint ? <Text style={{ color: t.textMuted, fontSize: font.small }}>{hint}</Text> : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? undefined}
        placeholderTextColor={t.textMuted}
        style={[
          styles.input,
          { color: t.text, backgroundColor: t.surface, borderColor: error ? t.danger : t.border },
          input.multiline ? { minHeight: 120, textAlignVertical: 'top' } : null,
          style,
        ]}
        {...input}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: t.danger, fontSize: font.small }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

// Skeleton shows only after ~200ms so quick loads don't flash.
export function useAfter(ms: number): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setReady(true), ms);
    return () => clearTimeout(id);
  }, [ms]);
  return ready;
}

export function SkeletonRows({ label }: { label: string }) {
  const t = useTheme();
  const visible = useAfter(200);
  return (
    <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }} style={{ gap: space.lg, padding: space.lg }}>
      {visible
        ? [0, 1, 2].map((i) => (
            <View key={i} style={{ gap: space.sm }}>
              <View style={[styles.bar, { backgroundColor: t.skeleton, width: '55%' }]} />
              <View style={[styles.bar, { backgroundColor: t.skeleton, width: '90%' }]} />
            </View>
          ))
        : null}
    </View>
  );
}

// Empty and error states: what happened / why empty + one way forward.
export function StateMessage({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space.md, padding: space.xxl }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: font.title, fontWeight: '600', textAlign: 'center' }}>
        {title}
      </Text>
      <Text style={{ color: t.textMuted, fontSize: font.body, lineHeight: 24, textAlign: 'center' }}>{message}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TARGET,
    paddingHorizontal: space.lg,
    borderRadius: radius.input,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  icon: { minWidth: MIN_TARGET, minHeight: MIN_TARGET, alignItems: 'center', justifyContent: 'center' },
  input: {
    minHeight: MIN_TARGET,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: font.body, // ≥ 16 avoids the iOS zoom-on-focus
  },
  bar: { height: 14, borderRadius: 4 },
});
