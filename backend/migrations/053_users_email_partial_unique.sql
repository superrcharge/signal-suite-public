-- +goose Up
-- +goose StatementBegin
-- An Entra v2 access token carries no email claim for a guest, B2B or CTR
-- identity unless the app registration adds email as an optional claim, and
-- no upn either, so SyncFromToken stores '' for such a user. email was
-- NOT NULL UNIQUE, which let exactly one of them exist: every later one failed
-- its insert on users_email_key and was answered 500 on every request it made,
-- while every member identity, the first admin included, was never affected.
-- Uniqueness now applies to a real address only; the empty string may repeat.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX users_email_unique ON users (email) WHERE email <> '';

-- A DoD display name carries rank, component and unit and can pass 100
-- characters, which failed the same insert with "value too long".
ALTER TABLE users ALTER COLUMN name TYPE VARCHAR(255);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users ALTER COLUMN name TYPE VARCHAR(100);
DROP INDEX IF EXISTS users_email_unique;
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
-- +goose StatementEnd
