// Media lives in R2 and is served at /media/<key> by the Worker (worker/index.ts). In `nuxt dev` the local media/ folder
// is served at the same URL. Content and components refer to a file by its key, never by a full URL.
const SAFE_KEY = /^[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/

/** `/media/<key>` for an R2 object key such as `blog/cover.svg`. Keys use letters, digits and `._~-`, with `/` between folders. */
export function mediaUrl(key: string): string {
  const k = key.replace(/^\/+/, '').replace(/^media\//, '')
  if (!SAFE_KEY.test(k) || k.split('/').some((s) => s === '.' || s === '..')) {
    throw new Error(`Invalid media key "${key}": use letters, digits and ._~- with / between folders`)
  }
  return `/media/${k}`
}
