import { getSession } from '@/lib/session'

// Tells the SPA whether to show the sign-in form. Never returns the token.
export async function GET() {
  const { accessToken } = await getSession()
  return Response.json({ loggedIn: Boolean(accessToken) })
}
