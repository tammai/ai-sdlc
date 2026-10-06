// Augments nuxt-auth-utils. `secure` is server-only: it is never sent to the browser.
declare module '#auth-utils' {
  interface User {
    id: string
  }
  interface SecureSessionData {
    accessToken: string
  }
}

export {}
