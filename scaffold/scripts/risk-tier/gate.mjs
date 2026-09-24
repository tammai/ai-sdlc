// Pure merge decision: does this pull request have the review its tier needs?
// Reviewers come from app.registry.json on the BASE branch, so a pull request can't
// approve itself by editing the registry.
//
//   green          → no review
//   yellow and red → an engineer review record for this exact commit (review-record.mjs), which
//                    /ai-sdlc:ship posts after the engineer-reviewer subagent has reviewed the branch.
//                    Its findings are warnings, never blockers. A person's approval also works:
//                    reviewers.yellow or reviewers.red for yellow, reviewers.red for red.
//
// "claudeReview": false in app.registry.json turns the review record off, so only people can
// clear yellow and red.

const lower = (list) => (list ?? []).map((s) => s.toLowerCase())

export function decide({ tier, reviews, registry, author, headSha, review }) {
  if (tier === 'green') return { pass: true, reason: 'No review needed — the automatic checks are enough.' }

  const red = lower(registry?.reviewers?.red)
  const yellow = lower(registry?.reviewers?.yellow)
  const me = (author ?? '').toLowerCase()
  const allowed = (tier === 'red' ? red : [...new Set([...yellow, ...red])]).filter((l) => l !== me)

  // The reviews API is chronological; each reviewer's latest decision wins, so a
  // later "changes requested" or a dismissal cancels an earlier approval.
  const latest = new Map()
  for (const r of reviews ?? []) {
    const login = r.user?.login?.toLowerCase()
    if (!login || r.state === 'COMMENTED' || r.state === 'PENDING') continue
    latest.set(login, r)
  }
  // An approval only counts for the exact commit it was given on — new commits need a new look.
  const approvers = [...latest]
    .filter(([login, r]) => r.state === 'APPROVED' && r.commit_id === headSha && allowed.includes(login))
    .map(([login]) => login)

  if (approvers.length) return { pass: true, reason: `Approved by ${approvers.map((l) => '@' + l).join(', ')}.`, approvers }

  const reviewOn = registry?.claudeReview !== false
  if (reviewOn && review?.sha === headSha) {
    const n = review.warnings ?? 0
    return {
      pass: true,
      reason: `Engineer review done by Claude${n ? `, with ${n} warning${n === 1 ? '' : 's'} (see the review comment)` : ', no warnings'}.`,
      approvers: ['claude'],
    }
  }

  const people = allowed.map((l) => '@' + l)
  if (!reviewOn && !people.length) {
    return {
      pass: false,
      reason: `No ${tier} reviewers other than the author are listed in app.registry.json. Ask an engineer to add them.`,
    }
  }
  const who = [...(reviewOn ? ['the engineer review (/ai-sdlc:ship runs it)'] : []), ...people]
  return { pass: false, reason: `Waiting for ${who.join(' or ')}.`, needed: allowed }
}
