import { checkCsrf } from '@/lib/csrf'
import { unauthorized, validationProblem } from '@/lib/problem'
import { listQuerySchema, newNoteSchema } from '@/lib/schemas'
import { getSession } from '@/lib/session'
import { upstream, upstreamFailure, upstreamSignal, upstreamUnavailable } from '@/lib/upstream'

export async function GET(request: Request) {
  const token = (await getSession()).accessToken
  if (!token) return unauthorized()

  const query = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return validationProblem(query.error)

  try {
    const { data, error, response } = await upstream(token).GET('/v1/notes', {
      params: { query: query.data },
      signal: upstreamSignal()
    })
    return data ? Response.json(data) : upstreamFailure(response, error)
  } catch {
    return upstreamUnavailable()
  }
}

export async function POST(request: Request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const token = (await getSession()).accessToken
  if (!token) return unauthorized()

  const body = newNoteSchema.safeParse(await request.json().catch(() => undefined))
  if (!body.success) return validationProblem(body.error)

  try {
    const { data, error, response } = await upstream(token).POST('/v1/notes', {
      body: body.data,
      signal: upstreamSignal()
    })
    return data ? Response.json(data, { status: 201 }) : upstreamFailure(response, error)
  } catch {
    return upstreamUnavailable()
  }
}
