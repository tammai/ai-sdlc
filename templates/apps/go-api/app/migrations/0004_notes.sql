-- +goose Up
-- Notes belong to a user; every query is scoped by owner_id (no IDOR).
CREATE TABLE notes (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id   uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title      text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    body       text        NOT NULL DEFAULT '' CHECK (char_length(body) <= 10000),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Keyset pagination per owner: newest first, id as tie-breaker.
CREATE INDEX notes_owner_created_at_id_idx ON notes (owner_id, created_at DESC, id DESC);

-- +goose Down
DROP TABLE notes;
