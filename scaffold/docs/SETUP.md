# Setting up a new app (engineer checklist)

About 30 minutes, once per app. Afterwards the app's owner works in the Claude desktop app, and you only see the pull requests the risk tier sends you.

## 1. Repository

1. Create the repo from this template (GitHub → *Use this template*), named after the app.
2. Fill in `app.registry.json`: name, one-line description, `type`, `data`, owner's GitHub handle, reviewers, and a `reviewBy` date roughly 6 months out.
   - `type`: `prototype` (preview only, fake data), `public` (anyone can open it), or `internal` (staff only, behind Access).
   - `data`: `public`, `internal`, or `personal`. Choose `personal` for anything HR-like, and every yellow change becomes red.
   - `reviewers.yellow` / `reviewers.red`: people who can approve instead of the engineer review, or instead of each other when `claudeReview` is `false`. GitHub won't let anyone approve their own pull request.
   - `reviewers.red`: at least two engineers.
3. Replace `@TODO-org/engineers` in `.github/CODEOWNERS`.
4. Add the owner as a collaborator with **write** access (not admin).

## 2. Cloudflare resources

```bash
pnpm exec wrangler d1 create <app>-db
pnpm exec wrangler d1 create <app>-db-preview
pnpm exec wrangler kv namespace create <app>-kv
pnpm exec wrangler kv namespace create <app>-kv-preview
```

Put the IDs, the Worker `name`, and `APP_TYPE` (the same as `type` in the registry) into `wrangler.jsonc` for both the top level and `env.preview`. Commit this on `main` before the owner starts. From then on the file is red tier.

## 3. Sign-in and bot protection

- **Internal apps:** on each Worker (production and `-preview`), open the **Access** tab → **Protect this Worker behind Access**.
  - Scope: **All traffic**.
  - Policy: your company's email domain or a group. Use **Cloudflare account** only for test apps. Don't reuse an existing "Allow emails" policy, because it lets in everyone listed for *other* apps.
  - Under **Application values**, copy the **AUD tag** into `ACCESS_AUD`, and the JWKS URL's host (`<team>.cloudflareaccess.com`) into `ACCESS_TEAM_DOMAIN`, for that environment in `wrangler.jsonc`.
- **Public apps:** protect only `/reports*` and `/api/feedback` for GET with an Access application on those paths. Create a Turnstile widget, put the site key in `TURNSTILE_SITE_KEY`, and set the secret:
  ```bash
  pnpm exec wrangler secret put TURNSTILE_SECRET_KEY --env=""
  pnpm exec wrangler secret put TURNSTILE_SECRET_KEY --env preview
  ```
- **Prototypes:** protect the preview hostname with Access. They have no production deploy (see step 4).

## 4. Deploys: Cloudflare Workers Builds

Connect the repo in the dashboard (Workers → the app → Settings → Builds). Nobody deploys from a laptop, and no Cloudflare token lives in GitHub.

Connect **two Workers** to the same repo. The second one exists only for previews.

**`<name>`, the production Worker**

| Setting | Value |
| --- | --- |
| Production branch | `main` (prototypes: a branch nobody pushes to, e.g. `never`) |
| Build command | `pnpm build` |
| Deploy command | `pnpm deploy:production` |
| Non-production branch builds | **off** |

**`<name>-preview`, the preview Worker**

| Setting | Value |
| --- | --- |
| Production branch | `main` (Workers Builds can't switch production builds off, so make them harmless instead) |
| Build command | `pnpm build` |
| Deploy command | `pnpm deploy:preview` |
| Non-production branch builds | on |
| Non-production deploy command | `pnpm deploy:preview` |

Both deploy commands are `pnpm deploy:preview`, so every build of this Worker, from `main` or a branch, uses the preview settings, database and KV. A merge to `main` just refreshes the preview.

> ⚠️ **Never turn on non-production builds on the production Worker with `pnpm deploy:preview`.** Workers Builds always deploys to the Worker it's connected to. `--env preview` only swaps the settings, so an unreviewed branch replaces production and runs against the preview database. This was verified the hard way on 2026-09-24. Previews share one preview Worker with its own D1 and KV, and the last branch pushed wins.

## 5. Branch protection on `main`

Use a ruleset (Settings → Rules → Rulesets) targeting `main`:

- Require a pull request before merging. **Required approvals: 0.** The `risk-tier` check decides who must approve.
- *Optional:* require review from Code Owners. With it on, changes to engineer-owned files always need a person, even when the Claude engineer review has cleared them. Leave it off to let Claude clear every red change.
- Require status checks: `checks` (from `ci`) and `risk-tier`.
- Block force pushes. Nobody on the bypass list.

Then open one test pull request to check that the `risk-tier` comment and label appear. They appear only after the workflow exists on `main`.

## 5b. The engineer review

Yellow and red changes are reviewed in the author's own Claude session at `/ai-sdlc:ship`, by a separate `ai-sdlc:engineer-reviewer` subagent that didn't write the change. It checks the branch against `REVIEW.md`, and its findings are **warnings**: the author's Claude offers to fix them, then posts the review on the pull request (`pnpm review:post`). The merge gate lets the change through when a review exists for the pull request's current commit.

- No API key or setup needed: it runs on the author's Claude.
- The review comment is a **record, not a lock**. Anyone with write access could post one by hand. The hard protections are the session hook, the risk tiers and the main-only deploy guard.
- `"claudeReview": false` in `app.registry.json` means only people can clear yellow and red: `reviewers.yellow` or `reviewers.red` for yellow, `reviewers.red` for red.

## 6. The owner's machine

The owner needs the Claude desktop app, Node 22+, pnpm (`npm i -g pnpm`) and git, signed in to GitHub. Then:

```bash
git clone <repo> && cd <repo>
pnpm install
pnpm db:migrate:local
pnpm dev
```

Open the folder in Claude. The hooks in `.claude/settings.json` load automatically.

> **Windows: keep the clone at a short path**, for example `C:\Users\<name>\apps\<repo>`. Nuxt's dependencies nest deeply, and under a long path (such as a temp or OneDrive folder) `pnpm install` fails with `Loading @nuxt/nitro-server server builder failed`. That's Windows' 260-character path limit, not a broken install. Enabling long paths (`git config --global core.longpaths true` plus the Windows `LongPathsEnabled` policy) also fixes it.

**Engineers working in the repo** should add this to their own `~/.claude/settings.json`, which unlocks engineer-owned files in their sessions:

```json
{ "env": { "RISK_TIER_ROLE": "engineer" } }
```

The `block` rules (secrets, destructive migrations) still apply to engineers, and CI still gates every merge.

## What each layer is for

| Layer | Where | Purpose | Can the session get round it? |
| --- | --- | --- | --- |
| `CLAUDE.md` | session | Tells Claude how to work and talk | Advisory only |
| `scripts/risk-tier/hook.mjs` | session | Blocks secrets, destructive SQL, deploys and engineer-owned edits; says when the tier changes | Mostly no. It's best-effort against shell tricks, which is why CI exists |
| `risk-tier` workflow | GitHub | Re-classifies from the base branch and requires the right approval | No. It runs the base branch's code, not the PR's |
| Branch protection and CODEOWNERS | GitHub | Makes the checks mandatory | Only an org admin can |
| Access / Turnstile / `requireUser` | runtime | Who can use the app | Engineer-owned code, red tier |
