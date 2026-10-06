import { newNoteSchema } from '../utils/schemas'

export default defineEventHandler(async (event) => {
  const token = await sessionToken(event)
  if (!token) return unauthorized()

  const body = newNoteSchema.safeParse(await readBody(event).catch(() => undefined))
  if (!body.success) return validationProblem(body.error)

  try {
    const { data, error, response } = await upstream(event, token).POST('/v1/notes', {
      body: body.data,
      signal: upstreamSignal()
    })
    if (!data) return upstreamFailure(response, error)
    setResponseStatus(event, 201)
    return data
  } catch {
    return upstreamUnavailable()
  }
})
