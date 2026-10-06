import { checkCsrf } from '@/lib/csrf'
import { validationProblem } from '@/lib/problem'
import { loginSchema } from '@/lib/schemas'
import { getSession } from '@/lib/session'
import { upstream, upstreamFailure, upstreamSignal, upstreamUnavailable } from '@/lib/upstream'

// DEV STUB: exchanges a pasted API token for a session. The token is verified by calling the Go API once,
// then kept in the sealed httpOnly cookie. Replace with your IdP / OAuth flow.
export async function POST(request: Request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const body = loginSchema.safeParse(await request.json().catch(() => undefined))
  if (!body.success) return validationProblem(body.error)

  try {
    const { error, response } = await upstream(body.data.token).GET('/v1/notes', {
      params: { query: { limit: 1 } },
      signal: upstreamSignal()
    })
    if (!response.ok) return upstreamFailure(response, error)
  } catch {
    return upstreamUnavailable()
  }

  const session = await getSession()
  session.accessToken = body.data.token
  await session.save()
  return Response.json({ ok: true })
}
