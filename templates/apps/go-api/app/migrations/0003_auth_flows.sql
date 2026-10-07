-- +goose Up
-- Short-lived, single-use artifacts of the sign-in flows. Secrets are stored as SHA-256 hashes
-- (except the IdP PKCE verifier and nonce, which the server must replay to the identity provider).
-- client_challenge / code_challenge: the native app's own PKCE S256 challenge (RFC 8252), checked
-- against the codeVerifier when the one-time code is exchanged ('' for web flows).
-- Expired rows are deleted by the server's janitor.
CREATE TABLE magic_links (
    token_hash bytea       PRIMARY KEY CHECK (octet_length(token_hash) = 32),
    email      text        NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
    client     text        NOT NULL CHECK (client IN ('web', 'native')),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oidc_states (
    state_hash    bytea       PRIMARY KEY CHECK (octet_length(state_hash) = 32),
    provider      text        NOT NULL,
    code_verifier text        NOT NULL,
    nonce         text        NOT NULL,
    client        text        NOT NULL CHECK (client IN ('web', 'native')),
    redirect      text        NOT NULL CHECK (char_length(redirect) <= 2048),
    client_challenge text     NOT NULL DEFAULT '' CHECK (char_length(client_challenge) <= 128),
    expires_at    timestamptz NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- One-time codes handed to native apps at the end of the OIDC flow (exchanged at /v1/auth/token).
CREATE TABLE auth_codes (
    code_hash  bytea       PRIMARY KEY CHECK (octet_length(code_hash) = 32),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_challenge text    NOT NULL CHECK (char_length(code_challenge) BETWEEN 43 AND 128),
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE auth_codes;
DROP TABLE oidc_states;
DROP TABLE magic_links;
