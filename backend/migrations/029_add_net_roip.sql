-- +goose Up
-- +goose StatementBegin

-- Whether this net is carried over IP (ROIP) rather than RF alone. Tracked per
-- net so a card can show at a glance which nets are ROIP'd.
ALTER TABLE nets ADD COLUMN roip BOOLEAN NOT NULL DEFAULT FALSE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE nets DROP COLUMN IF EXISTS roip;
-- +goose StatementEnd
