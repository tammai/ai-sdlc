import { zValidator } from "@hono/zod-validator";
import { desc, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createNoteSchema } from "@shared/schemas/note";
import { getDb } from "../db/client";
import { notes } from "../db/schema";
import type { AppEnv } from "../env";
import { validationProblem } from "../lib/problem";

// Auth goes here for non-public routes: `.use(requireUser)` (worker/middleware/require-user.ts), then store the user id on the row.
// Chain the handlers (no separate statements) so the exported AppType carries every route for the typed client.
export const notesRoute = new Hono<AppEnv>()
  .get("/", async (c) => {
    const rows = await getDb(c.env.DB).select().from(notes).orderBy(desc(sql`rowid`));
    return c.json(rows);
  })
  .post(
    "/",
    zValidator("json", createNoteSchema, (result, c) => {
      if (!result.success) return validationProblem(c, result.error);
    }),
    async (c) => {
      const [note] = await getDb(c.env.DB)
        .insert(notes)
        .values({ id: crypto.randomUUID(), ...c.req.valid("json") })
        .returning();
      return c.json(note, 201);
    },
  );
