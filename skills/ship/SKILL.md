---
name: ship
description: Stage 5 (Deploy) of the AI-native SDLC — commit the artifact chain with the code, open a PR whose body links intent/spec/plan/verify/review, babysit it to green (fix failing checks and agreed review comments), and stop at the production gate. Dev/preview deploys are autonomous; production needs a named human. Use when a change is verified/reviewed, or via /ai-sdlc:ship.
---

# Ship — the agent does everything up to the production gate and nothing past it

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`.

1. **Gate check:** `sdlc status` → plan approved, verify passed, review approved (M/L). Run `sdlc verify` once more on the final tree.
2. **Branch & commit:** never on main. `git switch -c <type>/<change-id>` if needed. Commit code and `docs/sdlc/<id>/` together (Conventional Commits; reference the change id). The chain in the same PR is the audit record.
3. **PR:** `gh pr create` with body:
   - Intent (one line) → link `docs/sdlc/<id>/intent.md`
   - What changed (from plan.md) + Deviations
   - Proof: verify summary (from verify.md), verifier verdict, screenshots for UI
   - Review: Important found/fixed/disputed (from review.md)
   - Risk tier, rollback (from plan.md)
4. **Babysit to green:** watch checks (`gh pr checks --watch`). Failing check → read logs (`gh run view --log-failed`), fix the code, verify, push. Review comments you agree with → fix, reply with SHA; disagree → reply with reasoning, leave for the human. If the repo has `.claude/commands/babysit.md`, use it (offer `sdlc scaffold babysit-command` on the first PR — it runs locally, no API key). Stop when only code-owner approval remains. **Never approve or merge your own PR; never force-push; never push to main.**
5. **Deploy by environment tier** (the guard hook's prod gate enforces the last row):
   | Env | Who | How |
   |---|---|---|
   | dev / preview | agent, freely | preview deploys per PR (Cloudflare Workers preview, `--env staging`, docker compose on a dev host) |
   | staging | agent after merge, if the pipeline doesn't already | the CI/CD path, not ad-hoc commands |
   | production | **human release authorization** | through CI on merge/tag; ad-hoc prod commands trigger the gate: `ask` (approve in prompt) or `deny` unless `RELEASE_APPROVAL=<ticket>` |
   Stack-specific deploy commands are in `${CLAUDE_PLUGIN_ROOT}/skills/stack/references/`.
6. **Rollback is the most-rehearsed path:** the PR body names the single rollback command; for tier L, rehearse it in staging before prod.
7. After merge: `sdlc close shipped --pr <url>`. Suggest `sdlc metrics` occasionally.
