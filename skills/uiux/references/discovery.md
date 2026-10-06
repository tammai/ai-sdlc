# UX discovery interview

Use when the user, the problem or the flow is fuzzy. Goal: a shared picture of who, why, and the path to done, in as few rounds as possible.

## Rules
- Open by restating the idea in 1–3 sentences; ask the user to correct it.
- Ask 3–5 high-leverage questions per round, in one message. After each answer, synthesize first (what changed), then ask the next round. Stop when the happy path and top pain points are clear — usually 2–3 rounds.
- Order: users and context → goals and current behavior → pain → success → constraints. Features last.
- Answer what you can from the repo/analytics yourself; don't ask the user for facts the code holds.
- Label every statement **Known** (user said / data shows), **Inferred** (your reasoning), **Unknown**. One conversation is not validated research — say so.

## Question bank (pick, don't dump)
- Who exactly uses this? Role, how often, on which device, in what situation?
- What event makes them need it right now?
- What do they do today instead? What's the workaround and what does it cost?
- Which part is most painful — frequent, slow, error-prone or expensive?
- What does success look like for them? How would we know (a number)?
- What must not change (habits, integrations, data, regulations)?
- Who else is affected (approvers, admins, support)?

## Synthesis (goes into ui.md "Understanding" or intent.md)
- Idea snapshot (2 lines)
- Primary / secondary users
- User goal and context of use
- Current behavior and workarounds
- Pain points (ranked: severity × frequency)
- Happy path (numbered steps)
- Journey: trigger → find → start → complete → confirm → failure/recovery, with friction per stage
- Opportunities
- Assumptions and open questions (with who can answer)
