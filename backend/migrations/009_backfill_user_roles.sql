-- +goose Up
-- +goose StatementBegin

-- Backfill existing users with the default "editor" role.
-- Under the new local-owned authorization model, SyncFromToken no longer
-- overwrites roles on every login, so any user currently stored with
-- roles='[]' would be stuck without permissions. Give everyone editor
-- by default and promote the earliest-created user to admin so the
-- system always has at least one admin after this migration lands.

UPDATE users
SET roles = '["editor"]'::jsonb
WHERE jsonb_typeof(roles) != 'array'
   OR jsonb_array_length(roles) = 0;

UPDATE users
SET roles = '["admin"]'::jsonb
WHERE id = (SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Revert all users to empty roles. This is destructive (loses role
-- assignments made after this migration ran), but matches the pre-RBAC
-- state where claims.Roles from the JWT was authoritative.
UPDATE users SET roles = '[]'::jsonb;

-- +goose StatementEnd
