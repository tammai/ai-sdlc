---
name: build
description: "Build an agreed intent: write a technical plan, get it reviewed before any code for yellow/red changes, then run the implement/verify loop — an implementer subagent builds (checks first), a fresh verifier audits the diff against the intent, capped at 3 rounds. Use after /ai-sdlc:shape when an intent has status: agreed, or when someone types /ai-sdlc:build."
---

# /ai-sdlc:build: make the examples true

The person agreed on examples, not code. You **orchestrate**:
- you write the plan and get it reviewed
- a separate **implementer** builds it
- a separate, fresh **verifier** checks the result against what was agreed

This is `bigin-skills`' `task-workflow` loop. Tell the person one plain sentence at each step. They don't need the mechanics.

## Before you start

- The intent must have `status: agreed`. If it's `draft`, run `/ai-sdlc:shape` first. Don't build from an idea nobody confirmed.
- You must be on the intent's branch, never `main`. Run `git fetch origin`, and if the branch is behind, `git merge origin/main`. Run `pnpm install` if `package.json` changed.

## Steps

1. **Plan, in the intent file.** Add a `## Technical plan` section at the bottom of `intent/<slug>.md`, for engineers and reviewers:
   - files to add or change, in order
   - schema changes (additive only)
   - server routes, and which ones call `requireUser` or `verifyTurnstile`
   - `app/queries/` composables
   - which Nuxt UI components and which template page structure
   - which test proves which example
   - risks

   Commit it: `git commit -am "Plan: <short name>"`.

   Coverage check, before going on: every example maps to a planned test, and everything in "What will change" maps to a step. Fix any gap in the plan now. It's one line here, and a whole round later.

2. **Plan review, for 🟡 and 🔴 only, before any code.** Use the `tier:` that `/ai-sdlc:shape` recorded in the intent. If there isn't one, anything that stores data, adds a server route, a library or an outside service counts as 🟡 or 🔴.
   1. Tell them: "Before building, a separate reviewer checks the plan. Changing a plan is cheap. Changing code isn't."
   2. Start a fresh **`ai-sdlc:engineer-reviewer`** with the Agent tool: *"Plan review of `intent/<slug>.md`."* Give it no summary of your own.
   3. **No warnings:** go to step 3.
   4. **Warnings:** explain each one in a plain sentence, then ask with `AskUserQuestion`: **Adjust the plan (Recommended)** / **Build as planned**.
      - *Adjust:* change the plan, commit, and run **one** more fresh plan review.
      - *Build as planned:* record the warnings under `### Plan review warnings` in the plan.

      Either way, don't loop on plan reviews more than twice. Anything left becomes a note in the plan.

3. **Implement.** Tell them: "Building it now. This takes a few minutes." Start the **`ai-sdlc:implementer`** subagent with the Agent tool, giving it the intent file's path and nothing else. Keep its agent ID. Wait for it:
   - `NEEDS_DECISION: …`: explain it plainly and ask the person with `AskUserQuestion`. If an example changes, update the intent first, then resume the same implementer (`SendMessage` to its ID) with their answer.
   - `DONE` plus check output: go to step 4.

4. **Verify with a fresh verifier every round.** Start a **new** **`ai-sdlc:verifier`** with the Agent tool, giving it the intent file's path. **Never pass the implementer's reply or summary.** The verifier reads the diff itself. It returns `{"verdict": "PASS" | "FAIL", "issues": [...]}`.
   - **`PASS`:** go to step 6.
   - **`FAIL`:** add a line to the plan's `### Build log` ("Round 2/3: <issue count> issues"). Then resume the **same** implementer with `SendMessage`, relaying the issues **verbatim**, so it fixes only what was flagged. When it replies `DONE`, start a **new** verifier (step 4 again). Never reuse a verifier.
   - **Trivial-fix exception.** You may fix issues yourself instead of resuming the implementer, but only if **every** issue on the list meets all four conditions:
     - it already names the correct value
     - it's text, not behaviour
     - it's one small hunk, in a file the diff already touches
     - it's all or nothing: the whole list qualifies, not just some of it

     Commit the fix, log the round as "orchestrator-applied", and still start a fresh verifier. Never fix it yourself twice running.

5. **Round cap: 3.** After three `FAIL`s, stop. Explain the remaining issues in plain words, then ask with `AskUserQuestion`: **Let me adjust the plan** / **Try one more round** / **Ask an engineer**. Don't go on to `/ai-sdlc:check` with a failing verification.

6. **Prove it yourself.** Run `pnpm typecheck && pnpm test:examples` and keep the output. Don't trust the implementer's copy. Then set `status: built` in the intent, commit, and tell them: "It's built, and a separate check confirmed it matches what we agreed. Say **/ai-sdlc:check** and I'll show you each example working."

## Scope

Build only what the examples need. If something else looks worth doing, add it to the intent's Open questions as a future idea.
