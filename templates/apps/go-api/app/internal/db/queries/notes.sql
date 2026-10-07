-- Every notes query is scoped by owner_id: never add one that is not.

-- name: CreateNote :one
INSERT INTO notes (owner_id, title, body)
VALUES (@owner_id, @title, @body)
RETURNING id, owner_id, title, body, created_at;

-- name: ListNotesFirstPage :many
SELECT id, owner_id, title, body, created_at
FROM notes
WHERE owner_id = @owner_id
ORDER BY created_at DESC, id DESC
LIMIT @page_limit;

-- name: ListNotesAfter :many
SELECT id, owner_id, title, body, created_at
FROM notes
WHERE owner_id = @owner_id
  AND (created_at, id) < (@after_created_at::timestamptz, @after_id::uuid)
ORDER BY created_at DESC, id DESC
LIMIT @page_limit;
