// Settings the browser needs. Only public values — never a secret.
export default defineEventHandler((event) => {
  const env = useEnv(event)
  return { appType: env.APP_TYPE, turnstileSiteKey: env.TURNSTILE_SITE_KEY || null }
})
