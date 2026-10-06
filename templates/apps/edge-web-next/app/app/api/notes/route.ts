import { desc, sql } from 'drizzle-orm'
import { createNoteSchema } from '@/shared/schemas/note'
import { db } from '@/server/db'
import { notes } from '@/server/db/schema'
import { problem, validationProblem } from '@/server/problem'

// Route handlers are the only server code. Validate every body/query with Zod from shared/.
// Auth goes here for non-public routes (Better Auth + its D1 Drizzle adapter): `const session = await requireUser(request)`.

export async function GET() {
  const rows = await db().select().from(notes).orderBy(desc(sql`rowid`))
  return Response.json(rows)
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => undefined)
  const parsed = createNoteSchema.safeParse(input)
  if (!parsed.success) return validationProblem(parsed.error)

  const [note] = await db()
    .insert(notes)
    .values({ id: crypto.randomUUID(), ...parsed.data })
    .returning()
  if (!note) return problem(500, 'Could not create the note')
  return Response.json(note, { status: 201 })
}
