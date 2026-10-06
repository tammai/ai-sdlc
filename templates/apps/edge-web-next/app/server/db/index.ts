import { drizzle } from 'drizzle-orm/d1'
import { cfEnv } from '../env'
import * as schema from './schema'

/** Drizzle client over the D1 binding. Create one per request; it is cheap. */
export function db() {
  return drizzle(cfEnv().DB, { schema })
}
