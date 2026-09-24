---
name: build
description: "Build an agreed intent: write a technical plan into the intent file, turn each agreed example into a browser check first, then implement until every check passes. Use after /ai-sdlc:shape when an intent has status: agreed, or when someone types /ai-sdlc:build."
---

# /ai-sdlc:build: make the examples true

The person agreed on examples, not code. Build exactly those, prove each one with a check, and keep them informed in one sentence at a time. Follow every rule in `CLAUDE.md`. The risk hook enforces the important ones anyway.

## Before you start

- The intent must have `status: agreed`. If it's `draft`, run `/ai-sdlc:shape` first. Don't build from an idea nobody confirmed.
- You must be on the intent's branch, never `main`.
- Run `git pull --ff-only origin main` if the branch is behind, then `pnpm install` if `package.json` changed.

## Steps

1. **Plan first, in the intent file.** Add a `## Technical plan` section at the bottom of `intent/<slug>.md`. This is for engineers and reviewers, so it may be technical:
   - files to add or change, in the order you'll touch them
   - schema changes, **additive only**: new tables or new nullable or defaulted columns
   - server routes, and which ones call `requireUser` or `verifyTurnstile`
   - which example each test proves
   - risks: anything that could break existing pages or data

   Commit it before writing code. Tell the person one sentence: "I've planned it: a new page, a list, and a place to store the entries."

2. **Checks first.** Write `tests/examples/<slug>.spec.ts`:
   - one `test()` per agreed example, **titled with the example sentence, word for word**
   - use `open(page, path)` and `shot(page, '<slug>-<n>')` from `./helpers`, with one screenshot per example at the moment it proves the example
   - use made-up data, and a unique marker (e.g. `Date.now()`) so reruns don't collide

   Run `pnpm test:examples` and confirm the new tests **fail** for the right reason: the feature doesn't exist yet.

3. **Build it.**
   - Database: edit `server/db/schema.ts`, then `pnpm db:generate` and `pnpm db:migrate:local`. Never edit or delete an existing file in `migrations/`.
   - Server: `server/api/<name>.<method>.ts`. Saving or changing data calls `requireUser(event)` for staff or `verifyTurnstile(event, token)` for public forms. Staff-only reads call `requireUser(event)`. Validate every input and cap text lengths.
   - Data from the server: add or extend `app/queries/<thing>.ts`, with a `useQuery` for each read and a `useMutation` for each write, invalidating the read's key. Follow `app/queries/feedback.ts`.
   - Pages: `app/pages/`, built from Nuxt UI components (`UForm`, `UFormField`, `UInput`, `UTable`, `UCard`, `UButton`, `UModal`…) inside the template's page structure (see `layers/ui/app/pages/reports.vue`). Add the page to `navigation` in `app/app.config.ts` if people should find it from the menu. It must work at phone width and in dark mode.

4. **Loop until green:** `pnpm typecheck && pnpm test:examples`.
   - **Never edit a test to make it pass.** If an example turns out impossible or ambiguous, stop and ask the person. If the example changes, update it in the intent first, then the test.
   - If the risk hook blocks something, explain what it protects in plain words and find the allowed way. If there isn't one, it's a job for an engineer: say so, and note it in the intent's Open questions.

5. **Keep the plan honest.** If what you built differs from the Technical plan, update the plan in the same commit.

6. **Commit** with a plain message: `git add -A && git commit -m "Build: <short name>"`. Set `status: built` in the intent.

7. **Next:** "It's built and every example passes. Say **/ai-sdlc:check** and I'll show you each one working."

## Scope

Build only what the examples need. If you notice something else worth doing, add it to the intent's Open questions as a future idea. Don't build it now.
