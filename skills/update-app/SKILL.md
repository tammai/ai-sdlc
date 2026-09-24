---
name: update-app
description: "Engineers: bring an existing ai-sdlc app's plugin-owned files (risk rules, gate, CI workflows, safety middleware, UI template shells, CLAUDE.md, REVIEW.md) up to the installed plugin version, on a new branch, without touching the app's own work. Use after updating the ai-sdlc plugin, or when someone types /ai-sdlc:update-app."
---

# /ai-sdlc:update-app: keep an app's safety files current

The plugin's skills and reviewer update by themselves. But the parts GitHub and Cloudflare run without Claude live in each app's repo, and they only change when this skill runs. That's the risk tiers, the merge gate, the CI workflows, the deploy guard and the UI shell.

**What it writes:** exactly the paths in `${CLAUDE_PLUGIN_ROOT}/scripts/managed.json`.
**What it never touches:** the app's own work. That's pages, queries, API routes, the schema, migrations, intents, content, example tests, `wrangler.jsonc`, `app.registry.json` and `app/app.config.ts`.

## Steps

1. **Start clean.** In the app's folder: `git switch main && git pull`. `git status` must be clean.

2. **Update:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/update-app.mjs"
   ```
   It creates the branch `ai-sdlc-update-<version>`, writes the managed files, and commits. It prints:
   - **Updated:** what changed. Read the diff (`git show --stat`, then `git show`) and summarise it in plain words.
   - **Kept:** extra files in plugin-owned folders that an engineer added. They're left alone.
   - **Dependencies differ:** versions the plugin expects but the app has differently. They're *not* changed. Decide with the engineer whether to align them (`pnpm add <dep>@<version>`), then commit.

3. **Prove it:** `pnpm install && pnpm check`. If a check fails, the app's code may depend on something the update changed. Fix it on this branch and explain what and why.

4. **Ship it** with `/ai-sdlc:ship`. It's red (engineer-owned files), so it gets the engineer review before it's pushed.
