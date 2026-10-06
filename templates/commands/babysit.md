---
description: Babysit the current PR to green — sweep unresolved review comments and failing checks, fix, push, repeat until only code-owner approval remains.
allowed-tools: Bash(gh pr *), Bash(gh run *), Bash(gh api *), Bash(git *), Read, Edit, Write, Grep, Glob
---

Babysit PR ${ARGUMENTS:-for the current branch}:

1. `gh pr view --json number,url,reviewDecision,statusCheckRollup,headRefName` and `gh api repos/{owner}/{repo}/pulls/<n>/comments` for unresolved threads.
2. For each failing check: `gh run view <id> --log-failed`, find the cause, fix the code (never the test, never skip a check), run the project's verify command locally.
3. For each unresolved review comment you agree with: fix and reply with the commit SHA. If you disagree, reply with your reasoning and leave it for the human.
4. Commit with a message that references the comment/check, push, wait for checks, and loop.
5. Stop when all checks are green and the only blocker is code-owner approval. Never approve or merge the PR yourself; never push to main; never force-push.
6. Report: what you fixed, what you disputed, what is waiting on a human.
