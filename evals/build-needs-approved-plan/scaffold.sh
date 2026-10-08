#!/usr/bin/env bash
# Tier M change: intent and spec approved, plan.md still a draft.
set -e
git init -q
D=docs/sdlc/2026-10-01-csv-export
mkdir -p .sdlc/local "$D" src
echo '{}' > .sdlc/config.json
for a in intent spec; do printf -- '---\nstatus: approved\ntier: M\n---\n# %s: CSV export\n' "$a" > "$D/$a.md"; done
printf -- '---\nstatus: draft\n---\n# Plan: CSV export\n\n## Files that change\n- src/export.js (new): toCsv(rows)\n' > "$D/plan.md"
printf 'export const reports = [];\n' > src/reports.js
echo '{"active":"2026-10-01-csv-export"}' > .sdlc/local/state.json
