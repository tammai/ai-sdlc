// Copies everything in media/ into the LOCAL R2 bucket that `wrangler dev` uses (state in .wrangler/state), so
// /media/<key> works the same locally as in production. It never touches the remote bucket: it always passes --local.
// Uploading to the real bucket is a deliberate, human step (see CLAUDE.md): wrangler r2 object put <bucket>/<key> --file <path> --remote
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { spawnSync } from 'node:child_process'

const TYPES = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8'
}

// The default bucket in wrangler.jsonc (the top-level r2_buckets entry).
const config = readFileSync('wrangler.jsonc', 'utf8')
const bucket = /"bucket_name"\s*:\s*"([^"]+)"/.exec(config)?.[1]
if (!bucket) {
  console.error('media:seed: no r2_buckets bucket_name found in wrangler.jsonc')
  process.exit(1)
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* files(p)
    else yield p
  }
}

let count = 0
for (const file of files('media')) {
  const key = relative('media', file).split(sep).join('/')
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const r = spawnSync('pnpm', ['exec', 'wrangler', 'r2', 'object', 'put', `${bucket}/${key}`, '--file', file, '--content-type', type, '--local'], {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
  count++
}
console.log(`media:seed: ${count} file(s) in local bucket ${bucket}`)
