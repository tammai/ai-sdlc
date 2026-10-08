// Which eval cases cover a set of changed files. Unit tests always run in full (they take seconds);
// selection only pays off for `claude plugin eval`, which spends plan usage.
// Returns null for "run every case", else the set of eval tags to pass to --tag.
import { execFileSync } from 'node:child_process';

// A change to any of these can move every behaviour, so it runs the whole eval suite.
const SHARED = [/^scripts\/(lib|sdlc)\.mjs$/, /^\.claude-plugin\//, /^evals\/_fixtures\//];
// Covered by the unit tests or by their own CI; no eval case exercises them.
const NO_EVALS = [/^test\//, /^templates\//, /^docs\//, /^\.github\//, /^\.claude\/CLAUDE\.md$/, /^agents(-src)?\//, /^scripts\/(build-agents|scaffold-app|detect)\.mjs$/,
  /^evals\/results\//, /^[^/]+\.md$/, /^LICENSE$/, /^\.gitignore$/];
const HOOK_SCRIPTS = { 'guard.mjs': 'guard', 'post-edit.mjs': 'post-edit', 'stop-gate.mjs': 'stop-gate', 'session-start.mjs': 'session-start' };

export function evalTags(files) {
  const tags = new Set();
  for (const f of files) {
    if (SHARED.some((re) => re.test(f))) return null;
    if (NO_EVALS.some((re) => re.test(f))) continue;
    let m;
    if ((m = f.match(/^skills\/([^/]+)\//))) { tags.add(`skill-${m[1]}`); tags.add('negative'); continue; } // a description change can steal triggers
    if ((m = f.match(/^scripts\/([^/]+\.mjs)$/)) && HOOK_SCRIPTS[m[1]]) { tags.add(HOOK_SCRIPTS[m[1]]); continue; }
    if (f === 'hooks/hooks.json') { tags.add('hooks'); continue; }
    if ((m = f.match(/^evals\/([^/]+)\//))) { tags.add(m[1]); continue; } // each case is tagged with its own name
    return null; // unknown territory: don't guess, run everything
  }
  return tags;
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);

// Committed since the merge-base with `base`, plus staged, unstaged and untracked work.
export function changedFiles(cwd, base) {
  const ref = base || ['origin/main', 'main'].find((r) => { try { git(cwd, 'rev-parse', '--verify', '--quiet', r); return true; } catch { return false; } });
  const committed = ref ? git(cwd, 'diff', '--name-only', `${ref}...HEAD`) : [];
  return [...new Set([...committed, ...git(cwd, 'diff', '--name-only', 'HEAD'), ...git(cwd, 'ls-files', '--others', '--exclude-standard')])].sort();
}
