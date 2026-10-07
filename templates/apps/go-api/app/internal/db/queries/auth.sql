-- Auth persistence. Secrets are only ever passed in as SHA-256 hashes.

-- name: CreateUser :one
INSERT INTO users (email, name, password_hash, email_verified_at)
VALUES (@email, @name, sqlc.narg(password_hash), sqlc.narg(email_verified_at))
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = @id;

-- name: GetUserByEmail :one
SELECT * FROM users WHERE lower(email) = lower(@email);

-- name: SetUserPasswordHash :exec
UPDATE users SET password_hash = sqlc.narg(password_hash) WHERE id = @id;

-- name: MarkUserEmailVerified :exec
UPDATE users SET email_verified_at = @verified_at WHERE id = @id AND email_verified_at IS NULL;

-- name: GetIdentityUserID :one
SELECT user_id FROM identities WHERE provider = @provider AND subject = @subject;

-- name: CreateIdentity :exec
INSERT INTO identities (provider, subject, user_id) VALUES (@provider, @subject, @user_id);

-- name: CreateSession :exec
INSERT INTO sessions (id, user_id, kind, token_hash, refresh_hash, expires_at, refresh_expires_at, created_at, last_used_at, user_agent, ip)
VALUES (@id, @user_id, @kind, @token_hash, sqlc.narg(refresh_hash), @expires_at, sqlc.narg(refresh_expires_at), @created_at, @created_at, @user_agent, @ip);

-- name: GetSessionByTokenHash :one
SELECT * FROM sessions WHERE token_hash = @token_hash;

-- name: GetSessionByID :one
SELECT * FROM sessions WHERE id = @id;

-- name: TouchSession :exec
UPDATE sessions SET last_used_at = @last_used_at, expires_at = @expires_at
WHERE id = @id AND revoked_at IS NULL;

-- name: RotateSession :execrows
UPDATE sessions
SET token_hash = @new_token_hash, refresh_hash = @new_refresh_hash, expires_at = @expires_at,
    refresh_expires_at = @refresh_expires_at, last_used_at = @now, user_agent = @user_agent, ip = @ip
WHERE id = @id AND refresh_hash = @old_refresh_hash AND revoked_at IS NULL AND refresh_expires_at > @now;

-- name: RevokeSession :exec
UPDATE sessions SET revoked_at = @revoked_at WHERE id = @id AND revoked_at IS NULL;

-- name: RevokeUserSessions :exec
UPDATE sessions SET revoked_at = @revoked_at WHERE user_id = @user_id AND revoked_at IS NULL;

-- name: CreateMagicLink :exec
INSERT INTO magic_links (token_hash, email, client, expires_at) VALUES (@token_hash, @email, @client, @expires_at);

-- name: ConsumeMagicLink :one
UPDATE magic_links SET used_at = @now
WHERE token_hash = @token_hash AND used_at IS NULL AND expires_at > @now
RETURNING email, client;

-- name: CreateOIDCState :exec
INSERT INTO oidc_states (state_hash, provider, code_verifier, nonce, client, redirect, client_challenge, expires_at)
VALUES (@state_hash, @provider, @code_verifier, @nonce, @client, @redirect, @client_challenge, @expires_at);

-- name: ConsumeOIDCState :one
DELETE FROM oidc_states WHERE state_hash = @state_hash AND expires_at > @now
RETURNING provider, code_verifier, nonce, client, redirect, client_challenge;

-- name: CreateAuthCode :exec
INSERT INTO auth_codes (code_hash, user_id, code_challenge, expires_at) VALUES (@code_hash, @user_id, @code_challenge, @expires_at);

-- name: ConsumeAuthCode :one
UPDATE auth_codes SET used_at = @now
WHERE code_hash = @code_hash AND used_at IS NULL AND expires_at > @now
RETURNING user_id, code_challenge;

-- name: DeleteExpiredSessions :execrows
DELETE FROM sessions
WHERE (kind = 'web' AND expires_at < @before)
   OR (kind = 'native' AND refresh_expires_at < @before)
   OR revoked_at < @before;

-- name: DeleteExpiredMagicLinks :execrows
DELETE FROM magic_links WHERE expires_at < @before;

-- name: DeleteExpiredOIDCStates :execrows
DELETE FROM oidc_states WHERE expires_at < @before;

-- name: DeleteExpiredAuthCodes :execrows
DELETE FROM auth_codes WHERE expires_at < @before;
