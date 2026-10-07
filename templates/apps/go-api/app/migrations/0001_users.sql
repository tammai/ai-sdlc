-- +goose Up
-- Accounts. email is unique case-insensitively; password_hash is NULL for accounts that only sign in
-- with a magic link or an external identity provider. email_verified_at is set once the user has
-- proven control of the address (magic link, or an IdP asserting email_verified=true).
CREATE TABLE users (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email             text        NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
    name              text        NOT NULL DEFAULT '' CHECK (char_length(name) <= 200),
    password_hash     text,
    email_verified_at timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

-- External identities (OIDC): one row per (provider, subject), linked to exactly one user.
CREATE TABLE identities (
    provider   text        NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 32),
    subject    text        NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject)
);
CREATE INDEX identities_user_id_idx ON identities (user_id);

-- +goose Down
DROP TABLE identities;
DROP TABLE users;
