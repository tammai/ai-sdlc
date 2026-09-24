import { drizzle } from 'drizzle-orm/d1'
import type { H3Event } from 'h3'
import * as schema from '../db/schema'

export function useDb(event: H3Event) {
  return drizzle(useEnv(event).DB, { schema })
}
