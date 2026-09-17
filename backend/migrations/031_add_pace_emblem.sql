-- +goose Up
-- +goose StatementBegin

-- The squadron's emblem, drawn in both channel wheel hubs. One per squadron,
-- so it belongs on the card header row rather than on either wheel.
--
-- NOT NULL DEFAULT '' rather than nullable: the empty string is the "no emblem"
-- value everywhere above this column, and a nullable column would add a second
-- one meaning the same thing.
ALTER TABLE pace_plans
    ADD COLUMN IF NOT EXISTS emblem_url VARCHAR(500) NOT NULL DEFAULT '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE pace_plans DROP COLUMN IF EXISTS emblem_url;
-- +goose StatementEnd
