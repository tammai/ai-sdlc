---
name: intent
description: Stage 1 (Plan) of the AI-native SDLC — turn a raw idea, request, bug report, incident or monitoring finding into a committed intent.md (problem, proposed outcome, affected users/systems, constraints, open questions, risk tier). Use when the user describes something they want built or changed, or via /ai-sdlc:intent.
argument-hint: "<idea in plain words>"
---

# Intent — capture what's being asked, not how

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`.

1. **Brainstorm until concrete — but cheaply.** Ask at most 3 questions per round, in one message, only about what changes the outcome: who is it for, what does "done" look like observably, what must not change. Answer anything you can from the repo yourself (routes, schema, existing screens) — use the `researcher-simple` subagent if it needs more than a few reads. Stop asking when you can write a falsifiable "Proposed outcome".
2. **Size the tier** (S / M / L — see the vibe skill's table) and say why in one line.
3. `sdlc new "<short title>" --tier <S|M|L>` (add `--fix` for bugs, `--source incident|monitor|scan|review` when not from a human). It prints the path and activates the change.
4. Fill `intent.md`. Rules:
   - Problem: who hurts, how often, what it costs. A number if there is one.
   - Proposed outcome: user-observable, not a solution design. "Customers see claim status, next step and expected date in the portal" — not "add a StatusPanel component".
   - Affected users and systems: include every surface (web/mobile/desktop) and the services/data stores touched.
   - Constraints: security, privacy, perf, deadlines, "existing auth only".
   - Open questions: only real ones, each with who can answer it.
   - Keep it under one screen.
5. Show it to the user: the Problem + Outcome lines, the tier, and open questions. Ask: approve, or correct?
6. On approval: `sdlc approve intent --by "<name>"`. On "no, we won't do this": `sdlc reject intent --reason "<why>"` (the rejection is part of the record and the survival-rate metric).

The intent is the product owner's artifact. If the user is not the product owner for this area, note who is in Open questions and stop at draft.
