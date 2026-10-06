-- +goose Up
CREATE TABLE notes (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    title      text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    body       text        NOT NULL DEFAULT '' CHECK (char_length(body) <= 10000),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Keyset pagination: newest first, id as tie-breaker.
CREATE INDEX notes_created_at_id_idx ON notes (created_at DESC, id DESC);

-- +goose Down
DROP TABLE notes;
