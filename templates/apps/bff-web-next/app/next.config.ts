import type { NextConfig } from 'next'

// Client-rendered pages ('use client') + route handlers under src/app/api acting as a thin BFF.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false
}

export default nextConfig
