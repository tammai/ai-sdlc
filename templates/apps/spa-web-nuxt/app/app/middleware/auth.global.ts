// Route guard. Unauthenticated users (401 from GET /v1/auth/me) go to /login with the intended path kept.
// Pages opt out with definePageMeta({ public: true }); sign-in/register also bounce signed-in users away.
export default defineNuxtRouteMiddleware(async (to) => {
  const isPublic = to.meta.public === true
  if (isPublic && !to.meta.guestOnly) return

  let user
  try {
    user = await useAuth().fetchUser()
  } catch {
    if (isPublic) return // let the sign-in page render its own error state
    throw createError({
      statusCode: 503,
      statusMessage: 'Service unavailable',
      message: "Couldn't reach the server. Check your connection and try again.",
      fatal: true
    })
  }

  if (!user && !isPublic) return navigateTo(loginLocation(to.fullPath))
  if (user && to.meta.guestOnly) return navigateTo(safeRedirect(to.query.redirect))
})
