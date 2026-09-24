# Engineer review policy

Engineer-owned (red tier). The `ai-sdlc:engineer-reviewer` subagent (from the ai-sdlc plugin) follows this file when
`/ai-sdlc:ship` runs it on a yellow or red change. Human engineers follow it too.

The author is usually not an engineer. They agreed on examples in `intent/*.md`, and Claude built them.
The review checks whether the change is safe to go live and **warns** about anything that isn't. Warnings never stop a change: they're shown on the pull request, and the author's Claude offers to fix them before merging. The review doesn't judge taste or style.

## Check each of these, and warn when one doesn't hold

1. **It does what the intent says, and nothing more.** Every agreed example is covered, and nothing unrelated changed.
2. **Data is protected.**
   - Routes that save or change data call `requireUser(event)` or `verifyTurnstile(event, token)`.
   - Staff-only reads call `requireUser(event)`.
   - Every input is validated, and text lengths are capped.
3. **Personal data is handled on purpose.** New fields about people (contact details, pay, health, ID numbers) are needed by the intent and shown only to signed-in staff. Nothing personal goes to logs, URLs or outside services.
4. **Outside services and libraries are justified.** Each one is needed by the intent, sends no more data than needed, and is well known and maintained. No secrets appear in code.
5. **The database only grows.** Migrations add tables or columns, and never rename, drop or rewrite existing data.
6. **Nothing weakens the safety net.** Changes to `.github/`, `.claude/`, `scripts/`, `REVIEW.md`, `CLAUDE.md`, `wrangler.jsonc`, `app.registry.json`, `layers/`, `ui-templates/`, sign-in or bot-protection code, or build and deploy scripts must keep every check at least as strict. Warn loudly (make it the first warning) about any of these:
   - removing or loosening a rule, check or review step
   - widening who can approve
   - deploying from somewhere other than `main`
   - turning off sign-in
7. **The checks still check the agreed examples.** Tests weren't edited just to make them pass.

## Warnings

Every finding is a warning. List them all, the riskiest first, whatever their size. Leave style, naming and formatting to the author's Claude.

## Writing the review

- `summary`: 1–3 plain sentences for the non-engineer who asked for the change. No code, no jargon.
- Each warning: the file, what's wrong in one sentence, and the concrete fix. The author's Claude session can apply it.
- If you can't tell whether something is safe from the diff alone, say so as a warning: "a human engineer should check …", and why.
