---
name: triage
description: "Engineers: turn new problem reports from a live ai-sdlc app (the 'Report a problem' button) into draft intents, so what users hit flows back into the next change. Reads the live database with one fixed read-only query. Use when someone asks to look at reports or feedback, or types /ai-sdlc:triage."
---

# /ai-sdlc:triage: close the loop

The playbook's Maintain stage feeds what happens in production back into planning. In these apps, that's the **Report a problem** button: reports land in the live `feedback` table. This skill turns the ones nobody has picked up into draft intents, which then go through `/ai-sdlc:shape` like any idea.

**Engineers only.** Reading the live database needs `RISK_TIER_ROLE=engineer` and Cloudflare credentials. If the person isn't an engineer, say so and stop.

## Steps

1. **Start from an up-to-date `main`:** `git switch main && git pull`. `git status` must be clean.

2. **Read the new reports:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/triage.mjs" .
   ```
   It runs one fixed `SELECT` on the live database and never reads who reported what. It leaves out reports that an intent already lists under `reports:`, and prints the rest as JSON. If there are none, say so and stop.

3. **Group them.** Put reports about the same problem together, and skip spam or tests. Show each group as one line: the problem in plain words, how many reports, and which page. Then ask with `AskUserQuestion` (multi-select) which groups to draft. Order them by how many people hit the problem.

4. **For each chosen group, write a draft intent** the way `/ai-sdlc:idea` does, on its own branch:
   - `git switch main && git switch -c idea/<slug>`
   - Write `intent/<YYYY-MM-DD>-<slug>.md` from `intent/_template.md` with `status: draft`, `author: problem reports`, and `reports: <ids>`.
   - Under **The problem**, quote the reports word for word. Never add names or emails, even if a message contains one: replace them with "a colleague".
   - Leave **Examples** empty for `/ai-sdlc:shape`. Put guesses under **Open questions**.
   - `git add intent/ && git commit -m "Idea: <short name> (reports <ids>)"`.

5. **Hand over.** List the branches you made. Say who should shape each one, usually the team that owns the app, and that they start with `/ai-sdlc:shape` on that branch.

## Don't

- Don't change the live database. Reports count as picked up once an intent lists them, so there's no status to update. The hook blocks writes anyway.
- Don't fix anything here. A report is a problem statement, not a plan.
