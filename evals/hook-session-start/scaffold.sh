#!/usr/bin/env bash
# An active tier-S change whose intent is approved: the next step is the plan.
set -e
git init -q
mkdir -p .sdlc/local docs/sdlc/2026-10-01-csv-export
echo '{}' > .sdlc/config.json
printf -- '---\nstatus: approved\ntier: S\n---\n# Intent: CSV export\n' > docs/sdlc/2026-10-01-csv-export/intent.md
echo '{"active":"2026-10-01-csv-export"}' > .sdlc/local/state.json
