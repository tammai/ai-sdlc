import { loginSchema } from '../../utils/schemas'

// DEV STUB: exchanges a pasted API token for a session. The token is verified by calling the Go API once,
// then kept in the sealed cookie's `secure` part (server-only). Replace with your IdP / OAuth flow.
export default defineEventHandler(async (event) => {
  const body = loginSchema.safeParse(await readBody(event).catch(() => undefined))
  if (!body.success) return validationProblem(body.error)

  try {
    const { error, response } = await upstream(event, body.data.token).GET('/v1/notes', {
      params: { query: { limit: 1 } },
      signal: upstreamSignal()
    })
    if (!response.ok) return upstreamFailure(response, error)
  } catch {
    return upstreamUnavailable()
  }

  await replaceUserSession(event, { user: { id: 'dev' }, secure: { accessToken: body.data.token } })
  return { ok: true }
})
