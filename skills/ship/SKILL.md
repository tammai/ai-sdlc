---
name: ship
description: "Send a checked change for review and go-live: confirm checks pass, explain the risk tier in plain words, run the independent engineer review for yellow/red changes on the local commit (fixing warnings if asked), then push once, open the pull request, post the review, and merge. Use after /ai-sdlc:check when the person confirmed it's what they wanted, or when they type /ai-sdlc:ship."
---

# /ai-sdlc:ship: review and go live

Nothing reaches the live app from this computer. `/ai-sdlc:ship` reviews the change **before anything leaves this computer**, pushes it once, opens a pull request, and merges. Merging to `main` deploys. Make that path obvious to someone who has never seen a pull request.

## Before you start

- The person said **yes** at `/ai-sdlc:check`. If not, run `/ai-sdlc:check` first.
- `pnpm check` passes on the current commit, and `git status` is clean. Commit anything left: `git add -A && git commit -m "…"`.
- You're on the idea's branch, not `main`.
- `gh auth status` works. If it doesn't, ask them to run `! gh auth login` and follow the browser prompts.

## Steps

1. **Tier, in their words.** Run `git fetch origin`, then `pnpm risk`, and explain the result in one or two sentences, using the reasons it lists:
   - 🟢 **Safe to ship:** goes live as soon as the automatic checks pass.
   - 🟡 **Needs a review:** a separate Claude reviewer checks it before it goes live.
   - 🔴 **Needs an engineer review:** a separate Claude reviewer checks it closely. Say which part triggered it ("because it stores staff phone numbers").

2. **Finish the intent.** Set `status: shipped` in the intent file and commit it. It ships when the pull request merges. Do this before the review, so the review reads the final commit.

3. **Engineer review, for 🟡 and 🔴 only, before pushing.** Run `git fetch origin`, then `pnpm risk` again, and use *that* tier: a fix can raise it, and every review has to compare against the latest `main`. Skip the rest of this step only if it's 🟢.
   1. Tell them: "A separate reviewer is checking the change now. It didn't write it, so it looks with fresh eyes. Nothing has left your computer yet."
   2. Start the **`ai-sdlc:engineer-reviewer`** subagent with the Agent tool, and wait for it to finish. Give it no summary of your own. It reads `REVIEW.md`, the intent and the diff against `origin/main` itself. That independence is the point, so don't tell it what you built or why.
   3. It replies with JSON (`sha`, `summary`, `warnings`). Check that `sha` is `git rev-parse HEAD`. If it isn't, throw the result away and start a new `ai-sdlc:engineer-reviewer` on the current commit (repeat 3.2). Save a matching result to a temporary file outside the repo.
   4. **No warnings:** go to step 4.
   5. **Warnings:** explain each one in one plain sentence, then ask with `AskUserQuestion`: **Fix them first (Recommended)** / **Ship as it is**.
      - *Fix them first:* apply each warning's fix, run `pnpm check`, and commit. Don't push. Then go back to the start of step 3 (a fresh `pnpm risk`, then a **new** `engineer-reviewer`, never the old one) on the new commit.
      - *Ship as it is:* go on. The warnings stay visible on the pull request.
   6. **Don't commit anything after the last review.** A review only counts for the commit it read. A new commit means a new review.

4. **Push once and open the pull request.** Check first with `gh pr view`: if a pull request already exists for this branch (you're back here after a fix), only push. Never run `gh pr create` a second time. If the push is rejected because the branch changed on GitHub (e.g. someone pressed "Update branch"), run `git pull`, then `pnpm check`, then go back to step 3 for a new review. Never force-push.
   ```bash
   git push -u origin HEAD
   gh pr create --base main --title "<the idea's short name, in plain words>" --body-file <tmpfile>   # first time only
   ```
   Body, in this order:
   - one paragraph: the problem and outcome, from the intent
   - the agreed examples as a checklist, each ✅
   - "Risk tier: 🟢/🟡/🔴 — <reason>"
   - a link to the intent file on the branch
   - "Screenshots: in the `example-checks` artifact of the `ci` run"

5. **Post the review** (🟡 and 🔴): `pnpm review:post <the saved file>`. It refuses a review of any commit other than the one the pull request is on, so if this fails, something was committed after the review: go back to step 3.

6. **Wait for the checks:** `gh pr checks --watch`. Explain any failure in plain words. To fix one: fix it, run `pnpm check`, commit, then go back to step 3 for a new review. Step 4 then only pushes, because the pull request already exists, and step 5 posts the new review. Never bypass a check.

7. **Merge** once `ci` and `risk-tier` are green: `gh pr merge --squash --delete-branch`. It's live a few minutes later at `urls.production` in `app.registry.json`.

8. **After merging:** `git switch main && git pull`. Then tell them: "It's live. If anything looks wrong, use **Report a problem** on any page. Each report becomes the next idea."

## Never

- Never push before the review has finished for 🟡 and 🔴 changes. Pushing starts the preview deploy and the checks, and those should only ever see reviewed code.
- Never write or edit the review yourself, or post one that didn't come from a fresh `ai-sdlc:engineer-reviewer`.
- Never merge before `risk-tier` is green. The gate blocks it anyway.
- Never deploy, change secrets or touch the live database. The risk hook blocks these, and they aren't part of shipping.
