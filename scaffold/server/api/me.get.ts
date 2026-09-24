// Who is signed in (Cloudflare Access), for showing a name in the header or sidebar.
// Never fails: returns { user: null } when nobody is signed in.
export default defineEventHandler(async (event) => {
  return { user: await getUser(event) }
})
