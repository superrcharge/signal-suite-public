-- +goose Up
-- +goose StatementBegin

-- Free-form text tag for grouping terminals across sections
-- (e.g. an operation name that pulls equipment from multiple SQDs).
-- Nullable, no enforced vocabulary - admins/editors type whatever
-- string makes sense for the moment. Length-capped to keep the row
-- indicator + tooltip readable.

ALTER TABLE terminals
    ADD COLUMN tag VARCHAR(100);

-- Filtering by tag (e.g. ?tag=Operation%20Avalanche) is the dominant
-- read pattern; LOWER index supports case-insensitive equality.
CREATE INDEX idx_terminals_tag_lower ON terminals (LOWER(tag)) WHERE tag IS NOT NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_terminals_tag_lower;
ALTER TABLE terminals DROP COLUMN IF EXISTS tag;

-- +goose StatementEnd
