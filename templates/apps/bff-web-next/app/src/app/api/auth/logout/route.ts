import { checkCsrf } from '@/lib/csrf'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  const csrf = checkCsrf(request)
  if (csrf) return csrf

  const session = await getSession()
  session.destroy()
  return Response.json({ ok: true })
}
