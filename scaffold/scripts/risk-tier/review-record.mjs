// The engineer review record: the PR comment /ai-sdlc:ship posts after the engineer-reviewer
// subagent (the ai-sdlc plugin's ai-sdlc:engineer-reviewer) has reviewed the branch. Engineer-owned.
//
// The merge gate lets a red change through when a record exists for the PR's current commit.
// Findings are warnings: they're shown, never blocking. The record proves a review was posted
// for that commit; it is not a lock, since anyone with write access can post a comment.

const MARKER = /<!-- engineer-review sha=([0-9a-f]{7,40}) warnings=(\d+) -->/

export function validateReview(review) {
  const problems = []
  if (!/^[0-9a-f]{40}$/.test(review?.sha ?? '')) problems.push('sha must be the full commit id')
  if (typeof review?.summary !== 'string' || !review.summary.trim()) problems.push('summary is missing')
  if (!Array.isArray(review?.warnings)) problems.push('warnings must be a list')
  else {
    review.warnings.forEach((w, i) => {
      for (const k of ['file', 'problem', 'fix']) if (typeof w?.[k] !== 'string') problems.push(`warnings[${i}].${k} is missing`)
    })
  }
  return problems
}

export function formatReviewComment({ sha, summary, warnings }) {
  const lines = [`<!-- engineer-review sha=${sha} warnings=${warnings.length} -->`, `## 🔍 Engineer review (Claude)`, '', summary]
  if (warnings.length) {
    lines.push('', "Warnings (worth fixing, but they don't stop this change):")
    for (const w of warnings) lines.push(`- ⚠️ \`${w.file}\`: ${w.problem} **Fix:** ${w.fix}`)
  } else {
    lines.push('', 'No warnings.')
  }
  lines.push('', `<sub>Reviewed commit \`${sha.slice(0, 7)}\` against \`REVIEW.md\`, by a separate reviewer that did not write the change.</sub>`)
  return lines.join('\n')
}

// The newest review record for exactly this commit, or null.
export function findReview(comments, headSha) {
  for (const c of [...(comments ?? [])].reverse()) {
    const m = c.body?.match(MARKER)
    if (m && headSha.startsWith(m[1]) && m[1].length === 40) {
      return { sha: m[1], warnings: Number(m[2]), by: c.user?.login ?? null, url: c.html_url ?? null }
    }
  }
  return null
}
