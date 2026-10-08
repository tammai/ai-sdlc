#!/usr/bin/env bash
# An ai-sdlc repo with an active change whose plan is still a draft.
set -e
git init -q
mkdir -p .sdlc/local docs/sdlc/c1 src
echo '{}' > .sdlc/config.json
printf -- '---\nstatus: approved\ntier: S\n---\n# Intent: CSV export\n' > docs/sdlc/c1/intent.md
printf -- '---\nstatus: draft\n---\n# Plan\n' > docs/sdlc/c1/plan.md
echo '{"active":"c1"}' > .sdlc/local/state.json
