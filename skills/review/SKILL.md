---
name: review
description: Stage 5 (Deploy) review loop of the AI-native SDLC — an independent reviewer subagent with fresh context (sonnet/high for tier M; for tier L a model different from the implementer's, sonnet/high with the default ladder) runs the bugs, security and compliance passes from REVIEW.md against the diff and spec/plan, findings are fixed by the implementer side, and review.md records the outcome. The agent that wrote the code never approves it. Use after build verification, before a PR, or via /ai-sdlc:review.
---

# Review — agents review, humans approve

Below, `sdlc` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.mjs"`.

Preconditions: `verify: passed` for the active change (`sdlc status`).

1. `sdlc draft review`. Ensure `REVIEW.md` exists (`sdlc scaffold review` if not).
2. `sdlc route reviewer` → dispatch the `agent` it returns with: the change id, the base branch, "follow REVIEW.md; output in your fixed format". Do **not** pass your own explanation of the change — fresh context is the point.
   For tier L the reviewer must run on a different model than the implementer: `sdlc route reviewer` picks it from `crossModelReview.ladder` (default: opus implementer → sonnet reviewer) and stamps `implemented_by` / `reviewed_by` / `independence` into review.md. Use exactly the agent it returns. If the main session did the implementing instead of a routed subagent, pass `--implementer-model <your model>`. If it warns that independence can't be verified, say so to the user rather than hiding it.
   If the diff touches UI (components, pages, screens, widgets, styles, copy), also dispatch `sdlc route ui-reviewer` in parallel per the **uiux** skill (mode D) and merge its Critical findings as Important `[ui]` findings.
3. Write its output into review.md (Important / Nits / Compliance matrix / Unplanned files / UI).
4. **Triage each Important finding yourself before acting** — re-read the cited code. Real → fix it (route the implementer for anything non-trivial), re-run `sdlc verify`, note `fixed in <sha>` under Resolution. Not real → write `disputed: <reason>` (the human decides). Compliance GAPs (an AC with no test) are Important by definition.
5. Re-run the reviewer once if you changed more than a few lines. Cap at 3 rounds; then hand the remaining disagreements to the user.
6. Present: Important count found/fixed/disputed, compliance matrix gaps, nits count. The user approves → `sdlc approve review --by "<name>"`. For tier L this is refused unless review.md says `independence: cross-model`; under the default `soft` gate the user may accept a same-model review with `--override "<reason>"` (recorded in review.md). That records the human judgment — the PR's code-owner approval remains the binding one.

Feedback into the system: a finding that repeats something Claude has gotten wrong before → **learn** skill (CLAUDE.md). A finding that cites a written policy → that policy belongs in a skill (**policy** skill) so it's applied while writing next time.

Then → **ship**.
