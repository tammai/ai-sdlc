// Pure risk classifier — no I/O. Given file changes and the rules config, returns
// the overall tier and the findings behind it. The hook, the CLI and CI all call
// this, so a change is judged the same way in a session as at merge time.
//
// A change is { path, status: 'added'|'modified'|'deleted'|'renamed', added: string[], content: string|null }.

export const TIERS = ['green', 'yellow', 'red']

const rank = (tier) => TIERS.indexOf(tier)
export const maxTier = (a, b) => (rank(a) >= rank(b) ? a : b)

const escapeRe = (s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&')

export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // '**/' is zero or more directories; any other '**' is anything at all
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 2
        } else {
          re += '.*'
          i += 1
        }
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if (c === '{') {
      const end = glob.indexOf('}', i)
      re += '(?:' + glob.slice(i + 1, end).split(',').map(escapeRe).join('|') + ')'
      i = end
    } else {
      re += escapeRe(c)
    }
  }
  return new RegExp('^' + re + '$')
}

export function normalizePath(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}

function compilePaths(patterns) {
  const include = []
  const exclude = []
  for (const p of patterns) (p.startsWith('!') ? exclude : include).push(globToRegExp(p.slice(p.startsWith('!') ? 1 : 0)))
  return (path) => include.some((re) => re.test(path)) && !exclude.some((re) => re.test(path))
}

export function compileRules(config) {
  return config.rules.map((rule) => ({
    ...rule,
    matchPath: compilePaths(rule.paths),
    addedRe: rule.added ? new RegExp(rule.added, (rule.flags ?? '') + 'g') : null,
  }))
}

function isAllowedHost(host, allowed = []) {
  const h = host.toLowerCase()
  return allowed.some((d) => h === d || h.endsWith('.' + d))
}

const snippet = (line) => {
  const t = line.trim()
  return t.length > 100 ? t.slice(0, 97) + '...' : t
}

function evaluateRule(rule, change, config) {
  if (!rule.matchPath(change.path)) return null
  if (rule.onStatus && !rule.onStatus.includes(change.status)) return null
  const finding = {
    rule: rule.id,
    tier: rule.tier,
    path: change.path,
    why: rule.why,
    next: rule.next,
    block: Boolean(rule.block),
    protected: Boolean(rule.protected),
  }
  if (rule.addedRe) {
    for (const line of change.added) {
      for (const m of line.matchAll(rule.addedRe)) {
        if (rule.externalOnly) {
          const host = m.slice(1).find(Boolean)
          if (!host || isAllowedHost(host, config.allowedExternalDomains)) continue
        }
        return { ...finding, detail: rule.redact ? '(value hidden)' : snippet(line) }
      }
    }
    return null
  }
  if (rule.requireAny) {
    if (change.status === 'deleted' || change.content == null) return null
    if (rule.requireAny.some((s) => change.content.includes(s))) return null
    return { ...finding, detail: `calls none of: ${rule.requireAny.join(', ')}` }
  }
  return finding
}

// opts.data is the app's data classification from app.registry.json; the config's
// `escalate` table can raise the tier for apps holding sensitive data.
export function classify(changes, config, opts = {}) {
  const rules = compileRules(config)
  const findings = []
  for (const change of changes) {
    const c = { ...change, path: normalizePath(change.path) }
    for (const rule of rules) {
      const f = evaluateRule(rule, c, config)
      if (f) findings.push(f)
    }
  }
  let tier = 'green'
  for (const f of findings) tier = maxTier(tier, f.tier)
  const raised = opts.data ? config.escalate?.[opts.data]?.[tier] : undefined
  const escalated = raised && raised !== tier ? { from: tier, to: raised, data: opts.data } : null
  if (escalated) tier = raised
  return { tier, findings, escalated }
}
