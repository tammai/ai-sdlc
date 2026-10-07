// sdlc scaffold-app — copy a full app template (templates/apps/<id>) into the repo, fill placeholders,
// install, wire verify commands + CLAUDE.md, and prove the empty app is green.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RENAMES = { _gitignore: '.gitignore', '_env.example': '.env.example', '_dev.vars.example': '.dev.vars.example', _npmrc: '.npmrc', '_golangci.yml': '.golangci.yml', _dockerignore: '.dockerignore', _prettierrc: '.prettierrc', _editorconfig: '.editorconfig', '_prettierignore': '.prettierignore' };
const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|zip|gz|jar|keystore|db|sqlite)$/i;
const KEEP_IN_EMPTY = new Set(['.git', '.sdlc', '.claude', 'docs', 'CLAUDE.md', 'REVIEW.md', 'DESIGN.md', 'README.md', 'LICENSE', '.gitignore', '.gitattributes', '.github', 'contracts']);

export const TEMPLATE_IDS = {
  'edge-web': { vue: 'edge-web-nuxt', react: 'edge-web-next', 'react-hono': 'edge-web-hono-react' },
  'spa-web': { vue: 'spa-web-nuxt', react: 'spa-web-react' },
  'bff-web': { vue: 'bff-web-nuxt', react: 'bff-web-next' },
  'go-api': { any: 'go-api' },
  flutter: { any: 'flutter' },
  expo: { any: 'expo' },
  tauri: { vue: 'tauri-vue', nuxt: 'tauri-nuxt', react: 'tauri-react' }
};
// Nuxt templates that share code through packages/ui-layer when a repo has more than one Nuxt app.
const NUXT_IDS = new Set(['edge-web-nuxt', 'spa-web-nuxt', 'bff-web-nuxt', 'tauri-nuxt']);
const LAYER_DIR = 'packages/ui-layer';

// Add `extends: ['<relative path to the layer>']` to a Nuxt app's nuxt.config.ts (idempotent).
function extendLayer(appDir, layerAbs) {
  const cfg = path.join(appDir, 'nuxt.config.ts');
  if (!fs.existsSync(cfg)) return false;
  const text = fs.readFileSync(cfg, 'utf8');
  if (/\bextends\s*:/.test(text)) return text.includes('ui-layer');
  const rel = path.relative(appDir, layerAbs).split(path.sep).join('/');
  const out = text.replace(/defineNuxtConfig\(\{\r?\n/, (m) => `${m}  // shared theme, components and composables (see ${LAYER_DIR}/README.md)\n  extends: ['${rel}'],\n`);
  if (out === text) return false;
  fs.writeFileSync(cfg, out);
  return true;
}

const DEFAULT_DIRS = { 'edge-web': 'web', 'spa-web': 'web', 'bff-web': 'web', 'go-api': 'api', flutter: 'mobile', expo: 'mobile', tauri: 'desktop' };

const kebab = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
const title = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p));
  }
  return out;
}

function copyTree(src, dst, vars, { overwrite }) {
  const written = [];
  const skipped = [];
  for (const rel of walk(src)) {
    const parts = rel.split(path.sep).map((p) => RENAMES[p] || p);
    const out = path.join(dst, ...parts);
    if (fs.existsSync(out) && !overwrite) {
      // .gitignore: merge lines instead of skipping
      if (path.basename(out) === '.gitignore') {
        const have = new Set(fs.readFileSync(out, 'utf8').split(/\r?\n/));
        const add = fs.readFileSync(path.join(src, rel), 'utf8').split(/\r?\n/).filter((l) => l && !have.has(l));
        if (add.length) fs.appendFileSync(out, `\n# added by ai-sdlc scaffold-app\n${add.join('\n')}\n`);
        continue;
      }
      skipped.push(path.relative(dst, out));
      continue;
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const buf = fs.readFileSync(path.join(src, rel));
    if (BINARY.test(rel) || buf.includes(0)) fs.writeFileSync(out, buf);
    else fs.writeFileSync(out, buf.toString('utf8').replace(/__(APP_NAME|APP_TITLE|APP_SNAKE|GO_MODULE|API_URL)__/g, (_, k) => vars[k]));
    written.push(path.relative(dst, out));
  }
  return { written, skipped };
}

function run(cmd, cwd) {
  console.log(`$ ${cmd}   (in ${cwd})`);
  const r = spawnSync(cmd, { cwd, shell: true, stdio: 'inherit' });
  return r.status === 0;
}

export function scaffoldApp({ root, plugin, args, flags, die, loadConfigRaw, saveConfigRaw }) {
  const appsDir = path.join(plugin, 'templates', 'apps');
  const stackFile = path.join(root, '.sdlc', 'stack.json');
  const stack = fs.existsSync(stackFile) ? JSON.parse(fs.readFileSync(stackFile, 'utf8')) : null;
  // Existing projects: only explicitly named new components, each into an empty folder (checked below).
  if (stack?.mode === 'existing' && !args.length) die('this repo has an existing app — name the new component to add, e.g. "sdlc scaffold-app tauri --dir desktop". Existing apps are never re-scaffolded.');

  // UI per component: --ui wins, then the choice recorded by `sdlc stack`, then Vue (the default templates)
  const recorded = Object.fromEntries((stack?.components || []).map((c) => [c.name, c]));
  let comps = args.length ? args.map((n) => ({ name: n, dir: recorded[n]?.dir })) : (stack?.components || []).map((c) => ({ name: c.name, dir: c.dir }));
  if (!comps.length) die(`nothing to scaffold — run "sdlc stack --surfaces … --backend …" first, or pass a component: ${Object.keys(TEMPLATE_IDS).join(' | ')}`);
  const multi = (stack?.components?.length || comps.length) > 1;
  const name = kebab(flags.name || path.basename(root));
  const vars = {
    APP_NAME: name,
    APP_TITLE: flags.title || title(name),
    APP_SNAKE: name.replace(/-/g, '_'),
    GO_MODULE: flags.module || `example.com/${name}/api`,
    API_URL: flags['api-url'] || stack?.apiUrl || 'http://localhost:8080'
  };

  // Resolve every component's template first, so we know whether Nuxt apps will share a layer.
  const uiOf = (c) => flags.ui || recorded[c.name]?.ui || 'vue';
  const existingNuxt = (stack?.apps || []).filter((a) => a.framework === 'nuxt');
  const nuxtWeb = comps.some((o) => ['edge-web', 'spa-web', 'bff-web'].includes(o.name) && uiOf(o) === 'vue') || existingNuxt.length > 0;
  const resolveId = (c) => {
    const ids = TEMPLATE_IDS[c.name];
    if (!ids) die(`unknown component ${c.name}`);
    let ui = uiOf(c);
    // desktop next to a Nuxt web app (new or existing) → Nuxt desktop, so both share the layer
    if (c.name === 'tauri' && !flags.ui && ui === 'vue' && nuxtWeb) ui = 'nuxt';
    const id = ids[ui] || ids[ui === 'react-hono' ? 'react' : ui] || ids.any;
    if (!id) die(`no ${ui} template for ${c.name} (available: ${Object.keys(ids).join(', ')})`);
    return id;
  };
  const plannedIds = comps.map(resolveId);
  const useLayer = plannedIds.filter((i) => NUXT_IDS.has(i)).length + existingNuxt.length > 1;
  const layerAbs = path.join(root, LAYER_DIR);

  const results = [];
  for (const [ci, c] of comps.entries()) {
    const id = plannedIds[ci];
    const tdir = path.join(appsDir, id);
    if (!fs.existsSync(path.join(tdir, 'template.json'))) die(`template ${id} is not available in this plugin version`);
    // placeholders are filled in template.json too, so install/verify commands can use the app name
    const meta = JSON.parse(fs.readFileSync(path.join(tdir, 'template.json'), 'utf8').replace(/__(APP_NAME|APP_TITLE|APP_SNAKE|GO_MODULE|API_URL)__/g, (_, k) => vars[k]));
    const dir = flags.dir && comps.length === 1 ? flags.dir : c.dir || (multi ? DEFAULT_DIRS[c.name] : '.');
    const target = path.resolve(root, dir);

    if (fs.existsSync(target)) {
      const busy = fs.readdirSync(target).filter((n) => !KEEP_IN_EMPTY.has(n));
      if (busy.length && !flags.force) die(`${dir}/ is not empty (${busy.slice(0, 5).join(', ')}${busy.length > 5 ? ', …' : ''}). Scaffold into an empty folder, or --force to copy over (existing files are kept).`);
    }
    console.log(`\n=== ${c.name} → ${dir}/  (template ${id}: ${meta.title})`);
    const app = copyTree(path.join(tdir, 'app'), target, vars, { overwrite: false });
    if (fs.existsSync(path.join(tdir, 'root'))) copyTree(path.join(tdir, 'root'), root, vars, { overwrite: false });
    for (const shared of meta.shared || []) copyTree(path.join(appsDir, '_shared', shared), path.join(root, shared), vars, { overwrite: false });
    if (app.skipped.length) console.log(`kept existing: ${app.skipped.join(', ')}`);
    if (useLayer && NUXT_IDS.has(id)) {
      if (!fs.existsSync(layerAbs)) copyTree(path.join(appsDir, '_shared', 'nuxt-layer'), layerAbs, vars, { overwrite: false });
      if (extendLayer(target, layerAbs)) console.log(`${dir}/nuxt.config.ts extends ${LAYER_DIR}`);
    }

    // CLAUDE.md: merge the template's stack notes under "## Stack"
    const frag = path.join(target, 'CLAUDE.stack.md');
    if (fs.existsSync(frag)) {
      const text = fs.readFileSync(frag, 'utf8').trim();
      fs.rmSync(frag);
      const cm = path.join(root, 'CLAUDE.md');
      const block = `### ${dir === '.' ? meta.title : `${dir}/ — ${meta.title}`}\n${text}\n`;
      // no CLAUDE.md yet → start from the plugin's one-page template so the stack notes aren't lost
      if (!fs.existsSync(cm)) fs.copyFileSync(path.join(plugin, 'templates', 'repo', 'CLAUDE.md'), cm);
      {
        let md = fs.readFileSync(cm, 'utf8');
        if (/^## Stack[^\n]*\n/m.test(md)) md = md.replace(/^## Stack[^\n]*\n(<!--[^]*?-->\n)?/m, (h) => `${h}${block}\n`);
        else md += `\n## Stack\n${block}`;
        fs.writeFileSync(cm, md);
      }
    }

    // verify commands: the template's, prefixed in monorepos, replacing any preset entries for this component
    const prefix = multi ? path.basename(dir) : null;
    const cd = dir === '.' ? '' : `cd ${dir.split(path.sep).join('/')} && `;
    const verify = meta.verify.map((v) => ({ name: prefix ? `${prefix}-${v.name}` : v.name, cmd: cd + v.cmd }));
    const cfg = loadConfigRaw();
    const mine = (n) => (prefix ? n.startsWith(`${prefix}-`) : verify.some((v) => v.name === n) || ['typecheck', 'lint', 'test', 'build'].includes(n));
    cfg.verify = [...(cfg.verify || []).filter((v) => !mine(v.name)), ...verify];
    saveConfigRaw(cfg);

    let installed = true;
    if (!flags['no-install']) for (const cmd of [...meta.install, ...(meta.postInstall || [])]) if (!(installed = run(cmd, target))) break;
    let green = null;
    if (installed && !flags['no-install'] && !flags['no-verify']) {
      green = meta.verify.every((v) => run(v.cmd, target));
    }
    results.push({ component: c.name, template: id, dir, files: app.written.length, installed, verify: green === null ? 'skipped' : green ? 'green' : 'FAILED', dev: meta.dev, toolchains: meta.toolchains });
  }
  // existing Nuxt apps are never edited here: tell the user how to opt them into the shared layer
  for (const a of useLayer ? existingNuxt : []) {
    const cfg = path.join(root, a.dir, 'nuxt.config.ts');
    if (fs.existsSync(cfg) && fs.readFileSync(cfg, 'utf8').includes('ui-layer')) continue;
    const rel = path.relative(path.join(root, a.dir), layerAbs).split(path.sep).join('/');
    console.log(`\nNext (tier S change): add extends: ['${rel}'] to ${a.dir}/nuxt.config.ts, then move shared theme/components into ${LAYER_DIR}.`);
  }
  console.log('\n' + JSON.stringify({ app: vars.APP_NAME, layer: useLayer ? LAYER_DIR : null, results }, null, 2));
  if (results.some((r) => r.verify === 'FAILED' || !r.installed)) process.exit(1);
}
