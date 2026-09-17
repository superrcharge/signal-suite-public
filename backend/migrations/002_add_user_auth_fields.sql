-- +goose Up
-- +goose StatementBegin
ALTER TABLE users
    ADD COLUMN oidc_subject VARCHAR(255) UNIQUE,
    ADD COLUMN roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX idx_users_oidc_subject ON users(oidc_subject);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_users_oidc_subject;
ALTER TABLE users
    DROP COLUMN IF EXISTS oidc_subject,
    DROP COLUMN IF EXISTS roles,
    DROP COLUMN IF EXISTS last_login_at;
-- +goose StatementEnd
