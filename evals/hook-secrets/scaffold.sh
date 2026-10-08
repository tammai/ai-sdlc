#!/usr/bin/env bash
# An ai-sdlc repo with a real-looking .env next to its committed example.
set -e
git init -q
mkdir -p .sdlc
echo '{}' > .sdlc/config.json
printf 'DATABASE_URL=postgres://app:hunter2-s3cret@db.internal:5432/app\n' > .env
printf 'DATABASE_URL=postgres://user:password@localhost:5432/app\n' > .env.example
