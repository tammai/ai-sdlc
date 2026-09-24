// Plain-language wording for a classification. The reader is usually the person
// who asked for the change, not an engineer — say what it means, not how it works.

export const TIER_MEANING = {
  green: {
    icon: '🟢',
    title: 'Safe to ship',
    text: 'The automatic checks are enough for this change. It can go live once they pass.',
  },
  yellow: {
    icon: '🟡',
    title: 'Needs a review',
    text: 'This changes what the app stores or how its server handles data. A separate Claude reviewer checks it at /ai-sdlc:ship and lists any warnings before it goes live.',
  },
  red: {
    icon: '🔴',
    title: 'Needs an engineer review',
    text: 'This touches something where a mistake is costly: personal data, sign-in, outside services, libraries or live infrastructure. A separate Claude reviewer checks it closely at /ai-sdlc:ship and lists any warnings before it goes live.',
  },
}

// Group findings by rule so one reason shows once, with every file it applies to.
function grouped(findings) {
  const byRule = new Map()
  for (const f of findings) {
    const g = byRule.get(f.rule) ?? { ...f, places: [] }
    g.places.push(f.detail ? `\`${f.path}\` — ${f.detail}` : `\`${f.path}\``)
    byRule.set(f.rule, g)
  }
  return [...byRule.values()].sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'red' ? -1 : 1))
}

export function formatReport({ tier, findings, escalated }, decision, review) {
  const m = TIER_MEANING[tier]
  const lines = [`## ${m.icon} ${m.title}`, '', m.text]
  if (escalated) {
    lines.push(
      '',
      `This app is registered as holding **${escalated.data}** data, so a change that would normally be ${escalated.from} is treated as ${escalated.to}.`,
    )
  }
  const reasons = grouped(findings).filter((g) => g.tier !== 'green')
  if (reasons.length) {
    lines.push('', '### Why')
    for (const g of reasons) {
      lines.push('', `**${TIER_MEANING[g.tier].icon} ${g.why}**`)
      if (g.next) lines.push(`What happens next: ${g.next}`)
      const shown = g.places.slice(0, 5)
      for (const p of shown) lines.push(`- ${p}`)
      if (g.places.length > shown.length) lines.push(`- …and ${g.places.length - shown.length} more`)
    }
  }
  if (review) {
    const link = review.url ? ` ([the review](${review.url}))` : ''
    lines.push('', '### Engineer review', '', `Done by Claude on commit \`${review.sha.slice(0, 7)}\`${link}.`)
  }
  if (decision) {
    lines.push('', '### Status', '', decision.pass ? `✅ ${decision.reason}` : `⏳ ${decision.reason}`)
    if (!decision.pass && tier !== 'green') {
      lines.push(
        '',
        'To clear it, run **/ai-sdlc:ship** in Claude on this branch: it runs the engineer review and posts it here. Or a reviewer approves the pull request, then adds the `recheck-risk` label.',
      )
    }
  }
  return lines.join('\n')
}

// One line for the Claude session, which then explains it to the user in its own words.
export function formatForSession({ tier, findings }, previous) {
  const m = TIER_MEANING[tier]
  const reasons = [...new Set(findings.filter((f) => f.tier === tier).map((f) => `${f.why} (${f.path})`))].slice(0, 4)
  return [
    `Risk tier for this branch is now ${tier.toUpperCase()} (was ${previous}). ${m.title}: ${m.text}`,
    ...reasons.map((r) => `- ${r}`),
    'When you next reply, tell the user this in one or two plain sentences — no jargon, no file paths unless they ask. Do not try to lower the tier by working around a rule.',
  ].join('\n')
}
