import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// `pnpm build` runs `opennextjs-cloudflare build`, which runs this command to produce the Next.js build first
// (it must not be the `build` script, or it would recurse).
const config = {
  ...defineCloudflareConfig(),
  buildCommand: 'next build'
}

export default config
