-- +goose Up
-- +goose StatementBegin

-- Who ultimately owns a SATCOM service or a transport provider. For a DoD
-- reader that is a separate fact from the operator: OneWeb is operated as
-- OneWeb and owned by Eutelsat, a French company; T-Mobile US is owned by
-- Deutsche Telekom, a German one.
--
-- Two columns rather than one free-text cell so the country can be read and
-- searched on its own. Both are optional, like every other descriptive column
-- on these libraries, and default to '' rather than NULL to match them.
-- Shareholdings and pending deals are prose and belong in description.

ALTER TABLE services
    ADD COLUMN IF NOT EXISTS owned_by      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS owner_country TEXT NOT NULL DEFAULT '';
ALTER TABLE transports
    ADD COLUMN IF NOT EXISTS owned_by      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS owner_country TEXT NOT NULL DEFAULT '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE transports
    DROP COLUMN IF EXISTS owner_country,
    DROP COLUMN IF EXISTS owned_by;
ALTER TABLE services
    DROP COLUMN IF EXISTS owner_country,
    DROP COLUMN IF EXISTS owned_by;

-- +goose StatementEnd
