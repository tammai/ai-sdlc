---
name: shape
description: "Turn an intent/*.md idea into 2–5 concrete, checkable examples ('When I…, I see…') and a plain-language description of what will change, then get the person's explicit OK. Use after /ai-sdlc:idea, when someone wants to agree the details, or types /ai-sdlc:shape."
---

# /ai-sdlc:shape: agree exactly what "done" looks like

The examples you agree here become the automatic checks, **word for word**. The person approves the examples, not the code. So they have to be concrete enough that anyone could try them in a browser and say yes or no.

## Steps

1. **Pick the intent.** Use the `intent/*.md` with `status: draft` on the current branch. If there are several, or none, ask which idea, or suggest `/ai-sdlc:idea`.

2. **Ground it in the app.** Read the pages, `server/db/schema.ts` and `server/api/` that the idea touches, so the examples use real page names and real data.

3. **Draft the examples**, 2–5 of them, each one sentence:
   - Form: **"When I <do something>, I see <something visible>."** Or: "When <a role> <does something>, <visible result>."
   - Each must be something you can **see on a page**. Not "the data is saved", but "…and it appears in the list".
   - Include **one unhappy path**: an empty form, a wrong value, or someone without access.
   - Use realistic but made-up values ("Jane Doe", "Marketing"), never real people's data.

4. **Describe what will change, in plain words**, in 3–6 bullets:
   - pages added or changed
   - what gets stored, as fields in everyday words ("start date", "team")
   - who can see it (signed-in staff, the public, only some people)

5. **Say what review it will need.** Use the tier rules in `CLAUDE.md`:
   - 🟢 changes to pages and wording only
   - 🟡 new things stored, or new server routes
   - 🔴 personal data, outside services, email, libraries or sign-in

   If `app.registry.json` says `"data": "personal"`, every 🟡 is 🔴. Say it in one sentence: "This one gets an engineer review before it goes live, because it stores staff contact details."

   **Then check the policies.** Read `POLICIES.md`, if it exists. For each policy this idea touches, explain it in one plain sentence and do what its *If touched* says. When a policy needs someone's OK (a data owner, a sign-off), ask with `AskUserQuestion`: **They've already agreed** / **I'll ask them first** / **Change the idea so it doesn't need it**. Don't decide for them, and don't skip a policy because it's awkward. If no policy applies, say so in one line.

6. **Ask for an explicit OK with `AskUserQuestion`:** "Are these the right examples?" with options **Yes, these are right** / **Change one or more** / **Something is missing**. If they choose a change, ask a second `AskUserQuestion` with `multiSelect` listing the examples, so they can tick which ones. Change them until they choose yes. **Don't treat silence or 'looks fine I guess' as yes.** Ask again, briefly.

7. **Write it into the intent file:**
   - Replace **Examples** with the agreed list, numbered.
   - Add a `## What will change` section with the bullets.
   - Add a `## Policy concerns` section: one line per policy touched (`<policy id>: <what the idea does about it>`). End the line with `(agreed by <role>)` when someone has already said yes, or with `(waiting for <role>)` when they haven't. Write `None.` if no policy applies.
   - Set `status: agreed`, and `tier:` to the tier you predicted in step 5 (`green`, `yellow` or `red`). `/ai-sdlc:build` uses it to decide whether the plan gets reviewed before any code.
   - Commit: `git commit -am "Agree examples: <short name>"`.

8. **Too big?** If you need more than about 5 examples, or more than 2 new tables, suggest splitting it into two ideas and shipping the first one alone. Smaller changes get reviewed and shipped faster.

9. **Next:** "Say **/ai-sdlc:build** and I'll build it. I'll show you each example working before anything goes live."
