// Picks which App templates jobs to run. A PR or push runs only the templates whose files changed;
// a change to anything templates share (scaffold code, _shared/, this workflow) runs all of them,
// and so do the weekly schedule and manual runs. Writes `matrix` and `combo` to $GITHUB_OUTPUT format on stdout.
import { execFileSync } from 'node:child_process';

const TEMPLATES = [
  { id: 'edge-web-nuxt', component: 'edge-web', ui: 'vue', dir: '.' },
  { id: 'edge-web-next', component: 'edge-web', ui: 'react', dir: '.' },
  { id: 'bff-web-nuxt', component: 'bff-web', ui: 'vue', dir: 'web' },
  { id: 'bff-web-next', component: 'bff-web', ui: 'react', dir: 'web' },
  { id: 'go-api', component: 'go-api', ui: 'vue', dir: 'api' },
  { id: 'tauri-vue', component: 'tauri', ui: 'vue', dir: '.' },
  { id: 'tauri-react', component: 'tauri', ui: 'react', dir: '.' },
  { id: 'flutter', component: 'flutter', ui: 'vue', dir: 'mobile' },
  { id: 'edge-web-hono-react', component: 'edge-web', ui: 'react-hono', dir: '.' },
  { id: 'spa-web-nuxt', component: 'spa-web', ui: 'vue', dir: 'web' },
  { id: 'spa-web-react', component: 'spa-web', ui: 'react', dir: 'web' },
  { id: 'expo', component: 'expo', ui: 'vue', dir: 'mobile' },
  { id: 'site-landing-nuxt', component: 'site-landing', ui: 'vue', dir: 'site' },
  { id: 'site-marketing-nuxt', component: 'site-marketing', ui: 'vue', dir: 'site' },
];
// templates the combo jobs scaffold together; tauri-nuxt is only exercised there
const COMBO = new Set(['edge-web-nuxt', 'spa-web-nuxt', 'bff-web-nuxt', 'tauri-nuxt', 'site-landing-nuxt', 'site-marketing-nuxt']);
const SHARED = [/^templates\/apps\/_shared\//, /^scripts\/(scaffold-app|sdlc|lib)\.mjs$/, /^\.github\/workflows\/templates\.yml$/, /^\.github\/scripts\/pick-templates\.mjs$/];

function changedIds() {
  const { EVENT, BASE, HEAD } = process.env;
  if (!['pull_request', 'push'].includes(EVENT) || !BASE || /^0+$/.test(BASE)) return null; // null = all
  const files = execFileSync('git', ['diff', '--name-only', BASE, HEAD], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const known = new Set([...TEMPLATES.map((t) => t.id), ...COMBO]);
  const ids = new Set();
  for (const f of files) {
    if (SHARED.some((re) => re.test(f))) return null;
    const m = f.match(/^templates\/apps\/([^/]+)\//);
    if (!m) continue; // docs (templates/apps/SPEC.md) and files outside templates don't need a run
    if (!known.has(m[1])) {
      console.error(`templates/apps/${m[1]} is not listed in .github/scripts/pick-templates.mjs — add it to TEMPLATES so CI tests it.`);
      process.exit(1);
    }
    ids.add(m[1]);
  }
  return ids;
}

const ids = changedIds();
const matrix = ids ? TEMPLATES.filter((t) => ids.has(t.id)) : TEMPLATES;
const combo = !ids || [...ids].some((id) => COMBO.has(id));
console.error(ids ? `changed templates: ${[...ids].join(', ') || '(none)'}` : 'running all templates');
console.log(`matrix=${JSON.stringify(matrix)}`);
console.log(`combo=${combo}`);
