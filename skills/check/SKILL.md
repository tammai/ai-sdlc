---
name: check
description: "Show the person that each agreed example works: run all checks, look at every screenshot, present example → result → picture, and ask 'is this what you wanted?'. Use after /ai-sdlc:build, before shipping, or when someone asks 'does it work?', 'show me', or types /ai-sdlc:check."
---

# /ai-sdlc:check: show, don't tell

The person can't read code, but they can look at a page and say "yes, that's it". Your job is to put the evidence in front of them and get an honest answer.

## Steps

1. **Run everything:** `pnpm check` (typecheck, risk-rule tests, and every example check). If anything fails, don't show a half result. Go back and fix it (`/ai-sdlc:build`'s loop), then run it again.

2. **Look at every screenshot yourself.** Open each `test-results/screens/<slug>-<n>.png` and confirm it *visibly* shows what its example says. A check can pass while the page looks wrong: broken layout, placeholder text, or the right data in the wrong place. If a picture doesn't match its example, treat it as a failure and fix it.

3. **Present the results**, one row per agreed example, in the person's words:

   | Example | Result | Picture |
   | --- | --- | --- |
   | When I add a new hire, I see them in the list | ✅ works | `test-results/screens/new-hire-1.png` |

   Give the picture as a clickable path. Then offer to let them try it themselves: "Run it on your computer? I'll start it and you can click around at http://localhost:3000." If they say yes, run `pnpm dev` and wait until it's up. Remind them that here they're signed in as a test user.

4. **Say the risk tier now, not at the end:** run `pnpm risk` and explain it in one or two sentences, using its wording. No surprises at `/ai-sdlc:ship`.

5. **Ask with `AskUserQuestion`:** "Is this what you wanted?" with options **Yes, ship it** / **Almost: something small is off** / **No, it's not what I meant**.
   - **Yes:** "Say **/ai-sdlc:ship** and I'll send it for review and go-live."
   - **Something's off:** write down what they said. If it changes an agreed example, update the example in the intent first (and set `status: agreed`), then `/ai-sdlc:build` again. Don't quietly patch it without updating the example.
   - **They want more:** that's a new idea. Suggest `/ai-sdlc:idea` after this one ships.

## Don't

- Don't say "all tests pass" without the table. The table is the result.
- Don't paste code or logs unless they ask.
