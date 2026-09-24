// Engineer-owned (red tier). Internal apps: nothing is served without a verified
// Access sign-in, even if the Access policy in front of the app is misconfigured.
// Public and prototype apps protect individual routes with requireUser()/verifyTurnstile().
export default defineEventHandler(async (event) => {
  // Build-time pre-rendering (e.g. Nuxt Content's data dump) has no bindings and no visitor.
  // import.meta.prerender is fixed at build time: it's never true in the deployed Worker.
  if (import.meta.prerender) return
  if (useEnv(event).APP_TYPE !== 'internal') return
  await requireUser(event)
})
