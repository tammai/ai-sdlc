import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, type TextInput } from 'react-native';

import { describeError } from '@/api/errors';
import { Button, Field } from '@/ui/components';
import { space, useTheme } from '@/theme';

import { useCreateNote } from './api';
import { BODY_MAX, TITLE_MAX, validateBody, validateTitle } from './validation';

export function NewNoteScreen() {
  const t = useTheme();
  const router = useRouter();
  const create = useCreateNote();
  const titleRef = useRef<TextInput>(null);
  const bodyRef = useRef<TextInput>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // Validate on blur once touched, then on every change once invalid; never clear the form on error.
  const [touched, setTouched] = useState({ title: false, body: false });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const titleError = touched.title ? validateTitle(title) : null;
  const bodyError = touched.body ? validateBody(body) : null;

  async function submit() {
    const tErr = validateTitle(title);
    const bErr = validateBody(body);
    setTouched({ title: true, body: true });
    if (tErr || bErr) {
      (tErr ? titleRef : bodyRef).current?.focus();
      return;
    }
    setSubmitError(null);
    try {
      await create.mutateAsync({ title: title.trim(), body: body || undefined });
      router.back();
    } catch (e) {
      setSubmitError(describeError(e, "Couldn't create the note."));
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <Field
          ref={titleRef}
          label="Title"
          hint={`${title.trim().length}/${TITLE_MAX}`}
          value={title}
          onChangeText={setTitle}
          onBlur={() => setTouched((s) => ({ ...s, title: true }))}
          error={titleError}
          returnKeyType="next"
          onSubmitEditing={() => bodyRef.current?.focus()}
          maxLength={TITLE_MAX + 50} // soft limit: lets the user see and fix an over-long paste instead of silently truncating
        />
        <Field
          ref={bodyRef}
          label="Body (optional)"
          hint={`Up to ${BODY_MAX.toLocaleString()} characters`}
          value={body}
          onChangeText={setBody}
          onBlur={() => setTouched((s) => ({ ...s, body: true }))}
          error={bodyError}
          multiline
        />
        {submitError ? (
          <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ color: t.danger, fontSize: 14 }}>
            {submitError} Your text is kept.
          </Text>
        ) : null}
        <Button title="Create note" onPress={() => void submit()} busy={create.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
