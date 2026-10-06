// sdlc scaffold-app — copy a full app template (templates/apps/<id>) into the repo, fill placeholders,
// install, wire verify commands + CLAUDE.md, and prove the empty app is green.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RENAMES = { _gitignore: '.gitignore', '_env.example': '.env.example', '_dev.vars.example': '.dev.vars.example', _npmrc: '.npmrc', '_golangci.yml': '.golangci.yml', _dockerignore: '.dockerignore', _prettierrc: '.prettierrc', _editorconfig: '.editorconfig', '_prettierignore': '.prettierignore' };
const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|zip|gz|jar|keystore|db|sqlite)$/i;
const KEEP_IN_EMPTY = new Set(['.git', '.sdlc', '.claude', 'docs', 'CLAUDE.md', 'REVIEW.md', 'DESIGN.md', 'README.md', 'LICENSE', '.gitignore', '.gitattributes', '.github', 'contracts']);

export const TEMPLATE_IDS = {
  'edge-web': { vue: 'edge-web-nuxt', react: 'edge-web-next' },
  'bff-web': { vue: 'bff-web-nuxt', react: 'bff-web-next' },
  'go-api': { any: 'go-api' },
  flutter: { any: 'flutter' },
  tauri: { vue: 'tauri-nuxt', react: 'tauri-react' }
};

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
  if (stack?.mode === 'existing' && !flags.force) die('this repo has an existing app (stack mode: existing) — scaffold-app is for new apps. Use --force to add a new component anyway.');

  const ui = flags.ui || (stack?.ui && /react/i.test(stack.ui) ? 'react' : 'vue');
  let comps = args.length ? args.map((n) => ({ name: n })) : (stack?.components || []).map((c) => ({ name: c.name, dir: c.dir }));
  if (!comps.length) die('nothing to scaffold — run `sdlc stack --surfaces … --backend …` first, or pass a component: edge-web | bff-web | go-api | flutter | tauri');
  const multi = (stack?.components?.length || comps.length) > 1;
  const name = kebab(flags.name || path.basename(root));
  const vars = {
    APP_NAME: name,
    APP_TITLE: flags.title || title(name),
    APP_SNAKE: name.replace(/-/g, '_'),
    GO_MODULE: flags.module || `example.com/${name}/api`,
    API_URL: flags['api-url'] || 'http://localhost:8080'
  };

  const results = [];
  for (const c of comps) {
    const ids = TEMPLATE_IDS[c.name];
    if (!ids) die(`unknown component ${c.name}`);
    const id = ids[ui] || ids.any;
    const tdir = path.join(appsDir, id);
    if (!fs.existsSync(path.join(tdir, 'template.json'))) die(`template ${id} is not available in this plugin version`);
    // placeholders are filled in template.json too, so install/verify commands can use the app name
    const meta = JSON.parse(fs.readFileSync(path.join(tdir, 'template.json'), 'utf8').replace(/__(APP_NAME|APP_TITLE|APP_SNAKE|GO_MODULE|API_URL)__/g, (_, k) => vars[k]));
    const dir = flags.dir && comps.length === 1 ? flags.dir : c.dir || (multi ? { 'edge-web': 'web', 'bff-web': 'web', 'go-api': 'api', flutter: 'mobile', tauri: 'desktop' }[c.name] : '.');
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
  console.log('\n' + JSON.stringify({ app: vars.APP_NAME, results }, null, 2));
  if (results.some((r) => r.verify === 'FAILED' || !r.installed)) process.exit(1);
}
