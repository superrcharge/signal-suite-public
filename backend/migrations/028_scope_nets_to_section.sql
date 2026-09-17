-- +goose Up
-- +goose StatementBegin

-- Nets become a per-squadron library rather than one global pool.
--
-- The problem this fixes: every squadron shared one set of nets, so A SQD
-- editing FIRES' frequency changed it for B SQD too. Net names are commonly
-- shared between squadrons -- FIRES, CMD, ASLT -- while the frequencies and
-- channels behind them are not.
--
-- Deliberately NOT a shared vocabulary table. A squadron types its own net
-- names; nothing is centrally approved. The durable-record shape is what
-- prevents retyping: a channel points at a net, so changing a net's frequency
-- updates every channel showing it, and moving it between channels carries the
-- frequency along.

-- Every existing row predates the concept and cannot be assigned an owner.
-- They are all development/test data on an unreleased feature -- the table was
-- created in migration 024 on this same unshipped branch and has never been
-- deployed. Reseed with `make seed-nets`.
DELETE FROM channel_assignments;
DELETE FROM nets;

ALTER TABLE nets ADD COLUMN section VARCHAR(50) NOT NULL
    REFERENCES sections(key) ON UPDATE CASCADE;

-- Uniqueness moves from global to per-squadron, which is the whole point: two
-- squadrons may each have a FIRES, and neither can have two.
DROP INDEX IF EXISTS nets_name_unique;
CREATE UNIQUE INDEX nets_section_name_unique ON nets (section, LOWER(name));

-- The library is always read one squadron at a time.
CREATE INDEX idx_nets_section ON nets (section);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_nets_section;
DROP INDEX IF EXISTS nets_section_name_unique;

-- Reverting means going back to one global pool, where a single FIRES is all
-- there can be. The rows the per-squadron library legitimately allows -- A SQD's
-- FIRES and B SQD's FIRES -- collide the instant nets_name_unique comes back, so
-- recreating that index over existing data fails with a duplicate key and takes
-- the whole `goose down` with it. Clearing first mirrors the Up, which deletes
-- for the same reason in the other direction: no row can survive a change of
-- what uniqueness means. Reseed with `make seed-nets`.
DELETE FROM channel_assignments;
DELETE FROM nets;

ALTER TABLE nets DROP COLUMN IF EXISTS section;
CREATE UNIQUE INDEX nets_name_unique ON nets (LOWER(name));
-- +goose StatementEnd
