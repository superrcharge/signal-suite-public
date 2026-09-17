-- +goose Up
-- +goose StatementBegin
ALTER TABLE terminals
    ADD COLUMN updated_by VARCHAR(200) NOT NULL DEFAULT '';

CREATE INDEX idx_terminals_search ON terminals
    USING gin(to_tsvector('english', name || ' ' || kit || ' ' || serial || ' ' || COALESCE(owner, '')));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_terminals_search;
ALTER TABLE terminals DROP COLUMN IF EXISTS updated_by;
-- +goose StatementEnd
