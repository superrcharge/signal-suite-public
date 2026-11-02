-- +goose Up
-- +goose StatementBegin

-- A theater per card and per net: a squadron's CONUS and OCONUS plans are
-- different plans, not two views of one. The whole card is duplicated per
-- theater - header, both wheels, the band rows and the four tiers - so every
-- PACE table gains the column and every per-squadron uniqueness key widens to
-- include it.
--
-- Everything that exists today is CONUS. The DEFAULT labels it without a data
-- statement, and the CHECK keeps the value closed the way tier and block are.
--
-- Nets are tri-state, mirroring radio_type: a net carried in both theaters
-- must not have to be entered twice.
--
-- The emblem stays on pace_plans and is replicated across a squadron's theater
-- rows by the repository; see pace.md for the invariant and why there is no
-- pace_emblems table.

ALTER TABLE pace_plans
    ADD COLUMN IF NOT EXISTS theater VARCHAR(10) NOT NULL DEFAULT 'conus'
        CONSTRAINT pace_plans_theater_check CHECK (theater IN ('conus', 'oconus'));
ALTER TABLE channel_plans
    ADD COLUMN IF NOT EXISTS theater VARCHAR(10) NOT NULL DEFAULT 'conus'
        CONSTRAINT channel_plans_theater_check CHECK (theater IN ('conus', 'oconus'));
ALTER TABLE pace_freq_rows
    ADD COLUMN IF NOT EXISTS theater VARCHAR(10) NOT NULL DEFAULT 'conus'
        CONSTRAINT pace_freq_rows_theater_check CHECK (theater IN ('conus', 'oconus'));
ALTER TABLE pace_tmn_rows
    ADD COLUMN IF NOT EXISTS theater VARCHAR(10) NOT NULL DEFAULT 'conus'
        CONSTRAINT pace_tmn_rows_theater_check CHECK (theater IN ('conus', 'oconus'));
ALTER TABLE pace_tiers
    ADD COLUMN IF NOT EXISTS theater VARCHAR(10) NOT NULL DEFAULT 'conus'
        CONSTRAINT pace_tiers_theater_check CHECK (theater IN ('conus', 'oconus'));
ALTER TABLE nets
    ADD COLUMN IF NOT EXISTS theater VARCHAR(10) NOT NULL DEFAULT 'conus'
        CONSTRAINT nets_theater_check CHECK (theater IN ('conus', 'oconus', 'both'));

-- The six per-squadron keys, each widened by theater. Two carry the names
-- Postgres generated for them: pace_plans.section was declared inline UNIQUE
-- (027) and channel_plans (section, radio_type) as an unnamed table
-- constraint (025).
ALTER TABLE pace_plans
    DROP CONSTRAINT IF EXISTS pace_plans_section_key,
    ADD CONSTRAINT pace_plans_section_theater_unique UNIQUE (section, theater);
ALTER TABLE channel_plans
    DROP CONSTRAINT IF EXISTS channel_plans_section_radio_type_key,
    ADD CONSTRAINT channel_plans_section_theater_radio_type_unique UNIQUE (section, theater, radio_type);
ALTER TABLE pace_freq_rows
    DROP CONSTRAINT IF EXISTS pace_freq_rows_position_unique,
    ADD CONSTRAINT pace_freq_rows_position_unique UNIQUE (section, theater, block, position);
ALTER TABLE pace_tmn_rows
    DROP CONSTRAINT IF EXISTS pace_tmn_rows_position_unique,
    ADD CONSTRAINT pace_tmn_rows_position_unique UNIQUE (section, theater, position);
ALTER TABLE pace_tiers
    DROP CONSTRAINT IF EXISTS pace_tiers_section_tier_unique,
    ADD CONSTRAINT pace_tiers_section_tier_unique UNIQUE (section, theater, tier);

-- Exact on (section, theater, name). The service refuses more than this - a
-- 'both' FIRES beside a 'conus' FIRES, since both would show in one list -
-- and the index is the floor a race cannot get under.
DROP INDEX IF EXISTS nets_section_name_unique;
CREATE UNIQUE INDEX nets_section_theater_name_unique ON nets (section, theater, LOWER(name));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Only CONUS survives a rollback: the narrow keys cannot hold two theaters.
-- Plans go first so their assignments cascade before any net they reference is
-- deleted (channel_assignments.net_id is RESTRICT). A 'both' net stays, as
-- CONUS. If a section holds a 'conus' and a 'both' net of one name, the
-- narrow index below refuses to build; the service rule prevents that pair,
-- and a refusal is the honest outcome if something got past it.
DELETE FROM channel_plans    WHERE theater <> 'conus';
DELETE FROM pace_plans       WHERE theater <> 'conus';
DELETE FROM pace_freq_rows   WHERE theater <> 'conus';
DELETE FROM pace_tmn_rows WHERE theater <> 'conus';
DELETE FROM pace_tiers       WHERE theater <> 'conus';
DELETE FROM nets             WHERE theater = 'oconus';

DROP INDEX IF EXISTS nets_section_theater_name_unique;
CREATE UNIQUE INDEX nets_section_name_unique ON nets (section, LOWER(name));

ALTER TABLE pace_tiers
    DROP CONSTRAINT IF EXISTS pace_tiers_section_tier_unique,
    ADD CONSTRAINT pace_tiers_section_tier_unique UNIQUE (section, tier);
ALTER TABLE pace_tmn_rows
    DROP CONSTRAINT IF EXISTS pace_tmn_rows_position_unique,
    ADD CONSTRAINT pace_tmn_rows_position_unique UNIQUE (section, position);
ALTER TABLE pace_freq_rows
    DROP CONSTRAINT IF EXISTS pace_freq_rows_position_unique,
    ADD CONSTRAINT pace_freq_rows_position_unique UNIQUE (section, block, position);
ALTER TABLE channel_plans
    DROP CONSTRAINT IF EXISTS channel_plans_section_theater_radio_type_unique,
    ADD CONSTRAINT channel_plans_section_radio_type_key UNIQUE (section, radio_type);
ALTER TABLE pace_plans
    DROP CONSTRAINT IF EXISTS pace_plans_section_theater_unique,
    ADD CONSTRAINT pace_plans_section_key UNIQUE (section);

-- Dropping the column drops its single-column CHECK with it.
ALTER TABLE nets             DROP COLUMN IF EXISTS theater;
ALTER TABLE pace_tiers       DROP COLUMN IF EXISTS theater;
ALTER TABLE pace_tmn_rows DROP COLUMN IF EXISTS theater;
ALTER TABLE pace_freq_rows   DROP COLUMN IF EXISTS theater;
ALTER TABLE channel_plans    DROP COLUMN IF EXISTS theater;
ALTER TABLE pace_plans       DROP COLUMN IF EXISTS theater;

-- +goose StatementEnd
