#!/usr/bin/env bash
# A small ai-sdlc web app for the "hard" trigger cases: real code to point at, no active change.
set -e
git init -q
mkdir -p .sdlc src/auth src/upload src/settings
echo '{}' > .sdlc/config.json
printf '{"name":"reports-app","type":"module","scripts":{"test":"node --test src"}}\n' > package.json
cat > src/auth/validate.js <<'JS'
// Email check used by the login and sign-up forms.
export const isValidEmail = (s) => /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(s);
export const loginError = (email) => (isValidEmail(email) ? null : 'invalid email');
JS
cat > src/upload/handler.js <<'JS'
// POST /api/upload: buffers the whole body, then stores it.
export async function upload(req, store) {
  const body = Buffer.from(await req.arrayBuffer());
  if (body.length > 10 * 1024 * 1024) return new Response('too large', { status: 413 });
  await store.put(crypto.randomUUID(), body);
  return new Response('ok');
}
JS
cat > src/log.js <<'JS'
export const log = (event, data) => console.log(JSON.stringify({ event, ...data, at: Date.now() }));
// e.g. log('login', { email, ip })
JS
printf '<template><form class="settings"><input name="name"/><input name="email"/><button>Save</button></form></template>\n' > src/settings/SettingsPage.vue
git add -A && git -c user.name=dev -c user.email=dev@example.com commit -qm "initial app"
