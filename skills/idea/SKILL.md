---
name: idea
description: "Capture what someone wants the app to do as an intent/*.md file in their own words, before anything is built. Use when a person describes a problem, a wish or a new feature ('I want…', 'can the app…', 'we need a way to…'), or types /ai-sdlc:idea."
---

# /ai-sdlc:idea: write down what they want

The person is usually not an engineer. Your job here is to **listen and write it down**, not to design or build. Nothing in the app changes during this step.

## Steps

1. **Let them explain.** If they already described it, don't make them repeat it. Reflect it back in one sentence first: "So the problem is… and you'd like…".

2. **Ask only what's missing, as pick-lists.** Use the `AskUserQuestion` tool, never a typed question: people answer faster by choosing, and "Other" always lets them type. Ask at most 5 questions in total. Batch up to 4 in one `AskUserQuestion` call. Give each question 2–4 concrete options that fit this idea, with the likeliest first. Pick from:
   - Who has this problem, and roughly how many people?
   - What happens today, and what's annoying about it?
   - What should be true afterwards? Ask for the outcome, not the screen.
   - Will it store anything about real people (names, contact details, pay, health, ID numbers)?
   - Any deadline, rule or "it must not…"?

   Stop asking when you could explain the idea to a stranger. Put anything still unknown under **Open questions**. Don't keep asking.

3. **Check it fits.** Read `app.registry.json` (`type`, `data`) and skim `app/pages/` and `server/db/schema.ts`, so you know what already exists. If the idea needs something the stack can't do (a mobile app, a different database, payments, AI, another company's service), say so plainly: "That part needs an engineer. I'll note it." Don't design around it.

4. **Start a branch** named after the idea, if you aren't already on one for it: `git switch -c idea/<slug>`, starting from an up-to-date `main`. The person never needs to know branch names.

5. **Write `intent/<YYYY-MM-DD>-<slug>.md`** from `intent/_template.md`:
   - Use `status: draft`. The author is their role (e.g. "HR team"), never a personal name or email.
   - The problem and outcome go **in their own words**. Quote them where you can.
   - Leave **Examples** as a rough list, or empty. `/ai-sdlc:shape` makes them precise.
   - Under **Data**, say plainly whether anything describes real people.

6. **Read it back** as five short lines (problem, who, outcome, data, open questions), then ask with `AskUserQuestion`: "Did I get that right?" with options **Yes, that's it** / **Mostly: small fixes** / **No, let me explain again**. Fix anything they correct. Their words win over yours.

7. **Commit** the file: `git add intent/ && git commit -m "Idea: <short name>"`.

8. **Early warnings, not blockers.** If the idea involves personal data, emails, outside services or new libraries, say in one sentence that the engineer review will look closely at that part before it goes live, and that it's fine to keep going.

9. **Next:** "Next we'll agree a few concrete examples of how it should work. Say **/ai-sdlc:shape** when you're ready."

## Don't

- Don't write code, change pages or touch the database.
- Don't turn it into a requirements document. A page of their words beats three pages of yours.
- Don't promise dates or tiers. `/ai-sdlc:shape` and `/ai-sdlc:ship` handle those.
