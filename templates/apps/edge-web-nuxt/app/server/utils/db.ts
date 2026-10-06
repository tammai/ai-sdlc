import { drizzle } from 'drizzle-orm/d1'
import type { H3Event } from 'h3'
import * as schema from '../db/schema'
import { cfEnv } from './env'

/** Drizzle client over the D1 binding. Create one per request; it is cheap. */
export function db(event: H3Event) {
  return drizzle(cfEnv(event).DB, { schema })
}
