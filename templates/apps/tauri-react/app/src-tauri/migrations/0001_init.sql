CREATE TABLE notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
    body       TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 10000),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_notes_created_at ON notes (created_at DESC, id DESC);
