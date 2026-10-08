#!/usr/bin/env bash
# A Workers project; `wrangler deploy` crosses the production boundary.
set -e
git init -q
mkdir -p .sdlc
echo '{"prodGate":"deny"}' > .sdlc/config.json
printf 'name = "app"\nmain = "src/index.ts"\n' > wrangler.toml
