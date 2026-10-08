// Pure helpers in scripts/lib.mjs, plus data the gates are built from (prod patterns, profiles).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN, makeRepo, write } from './helpers.mjs';
import { DEFAULT_CONFIG, matchesAny, openItems, chainStatus, loadConfig, routeAgent, ROLES } from '../scripts/lib.mjs';

describe('globs', () => {
  test('a pattern without "/" matches the basename anywhere', () => {
    assert.ok(matchesAny('apps/web/.env.local', ['.env.*']));
    assert.ok(matchesAny('deep/dir/id_rsa.pub', ['id_rsa*']));
    assert.ok(!matchesAny('src/environment.ts', ['.env', '.env.*']));
  });

  test('"**/" spans zero or more directories; braces alternate', () => {
    assert.ok(matchesAny('secrets/a', ['**/secrets/**']));
    assert.ok(matchesAny('infra/secrets/prod/a', ['**/secrets/**']));
    assert.ok(matchesAny('web/a/b/c.vue', ['web/**/*.{ts,vue}']));
    assert.ok(!matchesAny('web/a/b/c.css', ['web/**/*.{ts,vue}']));
  });

  test('default testGlobs cover the common test layouts', () => {
    for (const p of ['src/a.test.ts', 'src/a.spec.js', 'pkg/a_test.go', 'tests/test_a.py', 'app/__tests__/a.js', 'api/itest/a.go']) {
      assert.ok(matchesAny(p, DEFAULT_CONFIG.testGlobs), p);
    }
    assert.ok(!matchesAny('src/attest.ts', DEFAULT_CONFIG.testGlobs));
  });
});

describe('glob character classes', () => {
  const m = (name, glob) => matchesAny(name, [glob]);

  test('a class matches one of its characters, a range, or (negated) none of them', () => {
    assert.ok(m('.env', '.[e]nv'));
    assert.ok(m('bx', '[a-c]x') && !m('dx', '[a-c]x'));
    assert.ok(m('cb', '[!a]b') && !m('ab', '[!a]b'));
    assert.ok(m('cb', '[^a]b') && !m('ab', '[^a]b'), '^ negates like !');
  });

  test('a ] first in the class is a literal, and a negated class never crosses a /', () => {
    assert.ok(m(']x', '[]]x') && m('ax', '[]a]x') && !m('bx', '[]a]x'));
    assert.ok(m(']x', '[!a]x'));
    assert.ok(!matchesAny('a/x', ['a[!b]x']), 'a negated class does not match the separator');
  });

  test('an invalid or unterminated class is a literal, not an exception', () => {
    assert.doesNotThrow(() => matchesAny('x', ['[z-a].env', '[abc', '[]', '[!]']));
    assert.ok(m('[z-a].env', '[z-a].env'));
    assert.ok(m('[abc', '[abc'));
  });
});

describe('openItems (definition of ready)', () => {
  const body = (items) => `# Intent\n\n## Open questions\n${items}\n\n## Risk tier\nM\n`;

  test('unticked items are open; ticked, "None" and comments are not', () => {
    assert.deepEqual(openItems(body('- [ ] who pays? — PM\n- [x] which region → eu (by Tam)'), 'Open questions'), ['who pays? — PM']);
    assert.deepEqual(openItems(body('- None'), 'Open questions'), []);
    assert.deepEqual(openItems(body('<!-- list questions here -->'), 'Open questions'), []);
    assert.deepEqual(openItems('# no such section', 'Open questions'), []);
  });

  test('continuation lines belong to their bullet; the next heading ends the section', () => {
    assert.deepEqual(openItems(body('- [ ] q1\n  more detail on q1\n- [ ] q2'), 'Open questions'), ['q1', 'q2']);
  });
});

describe('chainStatus().next', () => {
  const doc = (status, extra = '') => `---\nstatus: ${status}\n${extra}---\n# x\n`;
  const next = (docs) => {
    const dir = makeRepo({ active: 'c1' });
    for (const [k, v] of Object.entries(docs)) write(dir, `docs/sdlc/c1/${k}.md`, v);
    return chainStatus(dir, loadConfig(dir), 'c1').next;
  };

  test('walks intent → spec → plan → build → review → ship for tier M', () => {
    assert.equal(next({}), 'intent');
    assert.equal(next({ intent: doc('approved', 'tier: M\n') }), 'spec');
    assert.equal(next({ intent: doc('approved', 'tier: M\n'), spec: doc('approved') }), 'plan');
    assert.equal(next({ intent: doc('approved', 'tier: M\n'), spec: doc('approved'), plan: doc('approved') }), 'build');
    assert.equal(next({ intent: doc('approved', 'tier: M\n'), spec: doc('approved'), plan: doc('approved'), verify: doc('passed') }), 'review');
    assert.equal(next({ intent: doc('approved', 'tier: M\n'), spec: doc('approved'), plan: doc('approved'), verify: doc('passed'), review: doc('approved') }), 'ship');
  });

  test('tier S skips spec and review; tier L needs a design first', () => {
    assert.equal(next({ intent: doc('approved', 'tier: S\n') }), 'plan');
    assert.equal(next({ intent: doc('approved', 'tier: S\n'), plan: doc('approved'), verify: doc('passed') }), 'ship');
    assert.equal(next({ intent: doc('approved', 'tier: L\n') }), 'design');
    assert.equal(next({ intent: doc('rejected') }), 'closed (intent rejected)');
  });
});

describe('routeAgent', () => {
  test('tier variants map to the documented model/effort', () => {
    assert.deepEqual(routeAgent('implementer', 'simple'), { agent: 'ai-sdlc:implementer-simple', complexity: 'simple', model: 'sonnet', effort: 'low' });
    assert.equal(routeAgent('implementer', 'complex').model, 'opus');
  });

  test('a missing variant rounds up to the stronger one', () => {
    assert.equal(routeAgent('reviewer', 'simple').agent, 'ai-sdlc:reviewer');
    assert.equal(routeAgent('verifier', 'complex').agent, 'ai-sdlc:verifier');
    assert.equal(routeAgent('nobody', 'normal'), null);
  });

  test('every routed agent has a file in agents/', () => {
    for (const [role, tiers] of Object.entries(ROLES)) {
      for (const t of tiers) {
        const name = routeAgent(role, t).agent.replace('ai-sdlc:', '');
        assert.ok(fs.existsSync(path.join(PLUGIN, 'agents', `${name}.md`)), `agents/${name}.md`);
      }
    }
  });
});

describe('production patterns', () => {
  const profiles = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'skills/stack/profiles.json'), 'utf8')).components;
  const all = [
    ...DEFAULT_CONFIG.prodPatterns.map((p) => ['default', p]),
    ...Object.entries(profiles).flatMap(([name, c]) => (c.prodPatterns || []).map((p) => [name, p]))
  ];
  // Commands that cross the release boundary. Every pattern must catch at least one of them.
  const RELEASES = [
    'pnpm run deploy --production', 'prod deploy api', 'vercel deploy --prod', 'netlify deploy --dir dist --prod',
    'wrangler deploy', 'fly deploy', 'kubectl apply -f k8s/prod.yaml', 'helm upgrade api ./chart -f values-prod.yaml',
    'terraform apply', 'npm publish', 'gh release create v1.2.0', 'git push --force origin feat', 'git push origin main',
    'wrangler d1 migrations apply DB --remote', 'wrangler kv key put k v', 'wrangler secret put API_KEY',
    'goose -dir db up --env prod', 'docker push registry/app:latest', 'psql $PROD_URL',
    'fastlane release', 'flutterfire deploy', 'firebase deploy', 'tauri signer sign', 'gh release upload v1 app.dmg',
    'wrangler r2 object put bucket/key', 'wrangler r2 bucket create media',
    'eas submit -p ios', 'eas update --branch production', 'eas build --auto-submit'
  ];
  // Everyday commands no pattern may catch: a gate that fires on these trains people to click through it.
  const EVERYDAY = ['git push origin feat/x', 'wrangler deploy --env staging', 'wrangler dev', 'npm test', 'pnpm build',
    'terraform plan', 'eas build --platform ios', 'docker build -t app .', 'wrangler r2 object put bucket/key --local'];

  test('every pattern is a valid regex with no JSON-mangled control characters', () => {
    for (const [owner, p] of all) {
      assert.doesNotMatch(p, /[\u0000-\u001f]/, `${owner}: ${JSON.stringify(p)} contains a control character`);
      assert.doesNotThrow(() => new RegExp(p, 'i'), `${owner}: ${p}`);
    }
  });

  test('every pattern catches at least one release command', () => {
    for (const [owner, p] of all) {
      assert.ok(RELEASES.some((c) => new RegExp(p, 'i').test(c)), `${owner}: ${p} matches none of the release examples — it may be inert`);
    }
  });

  test('no pattern fires on everyday commands', () => {
    for (const c of EVERYDAY) {
      const hit = all.find(([, p]) => new RegExp(p, 'i').test(c));
      assert.equal(hit, undefined, `${c} tripped ${hit?.join(': ')}`);
    }
  });
});
