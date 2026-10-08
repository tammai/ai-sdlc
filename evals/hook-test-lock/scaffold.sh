#!/usr/bin/env bash
# Fix flow mid-way: the reproducing test is locked, the plan is approved.
set -e
git init -q
mkdir -p .sdlc/local docs/sdlc/c1 src
echo '{}' > .sdlc/config.json
printf -- '---\nstatus: approved\ntier: S\nkind: fix\n---\n# Intent: sum is wrong\n' > docs/sdlc/c1/intent.md
printf -- '---\nstatus: approved\n---\n# Plan\n' > docs/sdlc/c1/plan.md
printf 'export const sum = (a, b) => a + b + 1;\n' > src/sum.js
printf "import { sum } from './sum.js';\nif (sum(2, 2) !== 4) throw new Error('sum(2, 2) should be 4');\n" > src/sum.test.js
echo '{"active":"c1","testLock":["src/sum.test.js"]}' > .sdlc/local/state.json
