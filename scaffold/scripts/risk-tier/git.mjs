// Turns git state into the change list classify() takes. Two shapes:
//   collectChanges({ cwd, base, head })  — a commit range (CI)
//   collectChanges({ cwd, base })        — base vs the working tree, untracked files included (hook, CLI)

import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 2 * 1024 * 1024

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })

export function isGitRepo(cwd) {
  try {
    return git(cwd, ['rev-parse', '--is-inside-work-tree']).trim() === 'true'
  } catch {
    return false
  }
}

export function gitDir(cwd) {
  return git(cwd, ['rev-parse', '--absolute-git-dir']).trim()
}

export function currentBranch(cwd) {
  try {
    return git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
  } catch {
    return null
  }
}

// The commit this branch forked from, so the tier covers the whole branch rather
// than only the last commit. Null when the repo has no commits yet.
export function resolveBase(cwd, preferred) {
  for (const ref of [preferred, 'origin/main', 'main'].filter(Boolean)) {
    try {
      git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
      return git(cwd, ['merge-base', ref, 'HEAD']).trim()
    } catch {}
  }
  try {
    return git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']).trim()
  } catch {
    return null
  }
}

function readAt(cwd, head, path) {
  try {
    if (head) return git(cwd, ['show', `${head}:${path}`])
    const full = join(cwd, path)
    if (statSync(full).size > MAX_BYTES) return null
    return readFileSync(full, 'utf8')
  } catch {
    return null
  }
}

function addedLines(cwd, range, paths) {
  const out = git(cwd, ['diff', '--no-color', '--unified=0', '--find-renames', ...range, '--', ...paths])
  return out
    .split(/\r?\n/)
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
}

const toLines = (content) => (content ? content.split(/\r?\n/) : [])

const STATUS = { A: 'added', D: 'deleted', R: 'renamed', C: 'added' }

export function collectChanges({ cwd, base, head }) {
  const changes = []
  if (base) {
    const range = head ? [base, head] : [base]
    const parts = git(cwd, ['diff', '--name-status', '-z', '--find-renames', ...range]).split('\0').filter(Boolean)
    for (let i = 0; i < parts.length; ) {
      const code = parts[i++]
      const oldPath = code[0] === 'R' || code[0] === 'C' ? parts[i++] : null
      const path = parts[i++]
      const status = STATUS[code[0]] ?? 'modified'
      if (status === 'deleted') {
        changes.push({ path, status, added: [], content: null })
        continue
      }
      changes.push({
        path,
        oldPath,
        status,
        added: addedLines(cwd, range, oldPath ? [oldPath, path] : [path]),
        content: readAt(cwd, head, path),
      })
    }
  }
  if (!head) {
    // Untracked files never show in `git diff`; with no base commit, staged files don't either.
    const listed = git(cwd, ['ls-files', '-z', '--others', '--exclude-standard', ...(base ? [] : ['--cached'])])
    for (const path of new Set(listed.split('\0').filter(Boolean))) {
      const content = readAt(cwd, null, path)
      changes.push({ path, status: 'added', added: toLines(content), content })
    }
  }
  return changes
}
