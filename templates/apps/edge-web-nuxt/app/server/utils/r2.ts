import type { H3Event } from 'h3'
import { cfEnv } from './env'

/** R2 bucket for files. Stream uploads; store the object key in D1. */
export function r2(event: H3Event) {
  return cfEnv(event).BUCKET
}
