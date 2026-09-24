# Rolling back

For engineers. Something that just went live is wrong, and people are affected. Rolling back is **never done from a Claude session**: the hook blocks `wrangler rollback`, and that's deliberate. Do it yourself, with your own credentials.

## 1. Decide: roll back or fix forward

| Situation | Do |
| --- | --- |
| People can't use the app, or data is being lost or exposed | **Roll back now**, then fix forward |
| Something looks or reads wrong, but works | **Fix forward:** start a normal change with `/ai-sdlc:idea` |
| The last deploy added a database migration | Read step 3 before rolling back |

## 2. Roll back the code

Either way works. Both go back to a build that came from `main`, so the deploy guard stays satisfied.

- **Cloudflare dashboard** (easiest): Workers & Pages → the production Worker → **Deployments** → the last good version → **Rollback**.
- **Retry an older build:** Workers & Pages → the Worker → **Builds** → the last good `main` build → **Retry build**.
- **Command line**, from your own terminal rather than a Claude session: `pnpm exec wrangler rollback --env production`, then pick the version.

Then open the app and check that the problem is gone.

## 3. If the bad deploy included a migration

Migrations only ever **add** tables and columns (the risk rules block anything else). So the old code keeps working against the newer database, and you can roll back the code as in step 2. **Don't** try to undo the migration: the next deploy expects it. If data was written wrongly, fix it with a new, reviewed migration or a one-off, reviewed script. Never edit the live database by hand.

## 4. Stop it coming back

A rollback doesn't change `main`, so the next merge would deploy the bad code again.
1. Revert the change on `main`: `git revert <merge-commit>` on a branch, then a pull request. The revert goes through the normal gate.
2. Or fix forward on a branch, before anything else merges.
3. Write a short note in the change's intent file, under **Open questions**: what went wrong and how it was found. `/ai-sdlc:learn` picks these up.

## 5. Tell people

Tell the app's owner (the author in the intent) in plain words: what broke, for whom, for how long, and that it's fixed.
