import type { H3Event } from 'h3'
import { cfEnv } from './env'

/** KV namespace — cache / flags only. Eventually consistent: never read-after-write for truth. */
export function kv(event: H3Event) {
  return cfEnv(event).KV
}
