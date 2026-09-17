-- +goose Up
-- +goose StatementBegin

-- Case-insensitive unique constraint on terminal name
CREATE UNIQUE INDEX terminals_name_unique ON terminals (LOWER(name));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS terminals_name_unique;

-- +goose StatementEnd
