declare module '#app' {
  interface PageMeta {
    /** Reachable without a session (sign-in, register, magic-link landing). */
    public?: boolean
    /** Signed-in users are bounced to the app (sign-in, register). */
    guestOnly?: boolean
  }
}

export {}
