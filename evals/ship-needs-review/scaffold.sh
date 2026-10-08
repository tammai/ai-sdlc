#!/usr/bin/env bash
# Tier M change: intent, spec and plan approved, verify passed, but no review.md yet.
set -e
git init -q
D=docs/sdlc/2026-10-01-csv-export
mkdir -p .sdlc/local "$D" src
echo '{}' > .sdlc/config.json
for a in intent spec plan; do printf -- '---\nstatus: approved\ntier: M\n---\n# %s: CSV export\n' "$a" > "$D/$a.md"; done
printf -- '---\nstatus: passed\nattempts: 1\n---\n# Verification evidence\nPASS test\n' > "$D/verify.md"
printf 'export const toCsv = (rows) => rows.map((r) => r.join(",")).join("\n");\n' > src/export.js
echo '{"active":"2026-10-01-csv-export"}' > .sdlc/local/state.json
