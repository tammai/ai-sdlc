# <Project name>

<!-- Keep this under one page: it is read at the start of every session. Day-one-joiner essentials only.
     Rule: when Claude makes the same mistake twice, the correction goes in "Things Claude gets wrong". -->

## Workflow
- AI-native SDLC via the ai-sdlc plugin: intent → spec → plan → build/verify → review → ship.
- Artifacts: docs/sdlc/<change-id>/. Nothing is implemented without an approved plan.md.
- When implementation departs from plan.md, update its "Deviations" section in the same commit.

## Commands
- Build: <cmd>
- Test: <cmd>
- Lint: <cmd>
- Run locally: <cmd>

## Verifying your work
- Run `sdlc verify` (runs the verify commands in .sdlc/config.json) before reporting any task complete, and paste the result.
- Never skip, delete or weaken a failing test. If a test fails, fix the code, not the test.
- UI changes: take a screenshot and compare with the mock/spec before reporting done.

## Stack
<!-- Filled from .sdlc/stack.json by /ai-sdlc:stack. -->

## Conventions
-

## Architecture
-

## Things Claude gets wrong
-
