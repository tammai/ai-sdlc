#!/usr/bin/env bash
# Approved plan, a verify command configured: an edit must be verified before the session stops.
set -e
git init -q
mkdir -p .sdlc/local docs/sdlc/c1 src
printf '{"verify":[{"name":"test","cmd":"node src/a.test.js"}]}\n' > .sdlc/config.json
printf -- '---\nstatus: approved\ntier: S\n---\n# Intent: entry point comment\n' > docs/sdlc/c1/intent.md
printf -- '---\nstatus: approved\n---\n# Plan\n' > docs/sdlc/c1/plan.md
printf 'export const main = () => 1;\n' > src/a.js
printf "import { main } from './a.js';\nif (main() !== 1) throw new Error('main');\n" > src/a.test.js
printf '{"type":"module"}\n' > package.json
echo '{"active":"c1"}' > .sdlc/local/state.json
