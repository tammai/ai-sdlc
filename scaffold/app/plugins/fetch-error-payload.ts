// Lets a failed server request (e.g. 401/403) travel from server rendering to the browser
// inside Pinia Colada's cache, so the page can show its own message for it. $fetch errors
// are class instances, which Nuxt's payload can't carry, so they travel as plain data.
interface PlainFetchError {
  message: string
  statusCode?: number
  statusMessage?: string
  data?: unknown
}

const isFetchError = (v: unknown): v is Error & PlainFetchError =>
  v instanceof Error && typeof (v as PlainFetchError).statusCode === 'number' && !('__nuxt_error' in v)

export default definePayloadPlugin(() => {
  definePayloadReducer('FetchError', (v: unknown) => {
    if (!isFetchError(v)) return
    const plain: PlainFetchError = { message: v.message, statusCode: v.statusCode, statusMessage: v.statusMessage, data: v.data }
    return plain
  })
  definePayloadReviver('FetchError', (v: PlainFetchError) => Object.assign(new Error(v.message), v))
})
