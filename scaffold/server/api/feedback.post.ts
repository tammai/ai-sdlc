import { feedback } from '../db/schema'

export default defineEventHandler(async (event) => {
  const env = useEnv(event)
  const body = await readBody<{ message?: unknown; page?: unknown; turnstileToken?: unknown }>(event)

  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message || message.length > 2000) {
    throw createError({ statusCode: 400, statusMessage: 'Please describe the problem (up to 2000 characters).' })
  }
  const page = typeof body?.page === 'string' ? body.page.slice(0, 300) : null

  // Public apps: anyone can report, but only after the bot check.
  // Internal apps: only signed-in staff, and we record who reported it.
  let reportedBy: string | null = null
  if (env.APP_TYPE === 'public') await verifyTurnstile(event, body?.turnstileToken)
  else reportedBy = (await requireUser(event)).email

  await useDb(event).insert(feedback).values({ message, page, reportedBy })
  return { ok: true }
})
