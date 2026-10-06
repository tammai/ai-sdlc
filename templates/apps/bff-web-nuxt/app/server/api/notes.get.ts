import { listQuerySchema } from '../utils/schemas'

export default defineEventHandler(async (event) => {
  const token = await sessionToken(event)
  if (!token) return unauthorized()

  const query = listQuerySchema.safeParse(getQuery(event))
  if (!query.success) return validationProblem(query.error)

  try {
    const { data, error, response } = await upstream(event, token).GET('/v1/notes', {
      params: { query: query.data },
      signal: upstreamSignal()
    })
    return data ?? upstreamFailure(response, error)
  } catch {
    return upstreamUnavailable()
  }
})
