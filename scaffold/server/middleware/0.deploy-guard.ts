// Engineer-owned (red tier). Runs before every other middleware (files run in name order).
//
// The production Worker serves traffic only if scripts/deploy-guard.mjs deployed it,
// which it does only for a Workers Builds build of `main`. Anything else deployed to
// production (a laptop `wrangler deploy`, a branch build on a misconfigured Worker)
// switches itself off instead of serving unreviewed code.
export default defineEventHandler((event) => {
  // Local dev, and build-time pre-rendering (fixed at build time, never true in the deployed Worker).
  if (import.meta.dev || import.meta.prerender) return
  const env = useEnv(event)
  if (env.DEPLOY_ENV === 'production' && env.DEPLOYED_FROM !== 'main') {
    throw createError({
      statusCode: 503,
      statusMessage: 'This version of the app was not deployed from approved code, so it is switched off. An engineer needs to redeploy main.',
    })
  }
})
