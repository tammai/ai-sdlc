-- +goose Up
-- Server-side sessions. Tokens are opaque random values; only their SHA-256 hashes are stored.
--   web:    token_hash = session cookie; expires_at slides on use (capped by the absolute lifetime).
--   native: token_hash = current access token (expires_at = access expiry);
--           refresh_hash = current refresh token, rotated on every refresh. Presenting an older
--           refresh token of the session is treated as theft and revokes the whole session.
CREATE TABLE sessions (
    id                 uuid        PRIMARY KEY,
    user_id            uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind               text        NOT NULL CHECK (kind IN ('web', 'native')),
    token_hash         bytea       NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    refresh_hash       bytea       UNIQUE CHECK (octet_length(refresh_hash) = 32),
    expires_at         timestamptz NOT NULL,
    refresh_expires_at timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    last_used_at       timestamptz NOT NULL DEFAULT now(),
    revoked_at         timestamptz,
    user_agent         text        NOT NULL DEFAULT '' CHECK (char_length(user_agent) <= 512),
    ip                 text        NOT NULL DEFAULT '' CHECK (char_length(ip) <= 64),
    CHECK ((kind = 'native') = (refresh_hash IS NOT NULL AND refresh_expires_at IS NOT NULL))
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- +goose Down
DROP TABLE sessions;
