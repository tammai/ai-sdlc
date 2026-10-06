import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

const nextConfig: NextConfig = {}

export default nextConfig

// `next dev` runs in Node; this exposes the wrangler.jsonc bindings (D1/KV/R2, emulated locally) to getCloudflareContext().
initOpenNextCloudflareForDev()
