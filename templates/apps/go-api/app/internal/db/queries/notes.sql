-- name: CreateNote :one
INSERT INTO notes (title, body)
VALUES (@title, @body)
RETURNING id, title, body, created_at;

-- name: ListNotesFirstPage :many
SELECT id, title, body, created_at
FROM notes
ORDER BY created_at DESC, id DESC
LIMIT @page_limit;

-- name: ListNotesAfter :many
SELECT id, title, body, created_at
FROM notes
WHERE (created_at, id) < (@after_created_at::timestamptz, @after_id::uuid)
ORDER BY created_at DESC, id DESC
LIMIT @page_limit;
