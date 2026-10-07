import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/** Drizzle client over the D1 binding. Create one per request (`getDb(c.env.DB)`); it is cheap. */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}
