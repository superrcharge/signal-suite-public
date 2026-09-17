-- +goose Up
CREATE TABLE platforms (
    id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    designation      TEXT        NOT NULL,
    popular_name     TEXT        NOT NULL DEFAULT '',
    category         TEXT        NOT NULL DEFAULT 'joint',
    kind             TEXT        NOT NULL DEFAULT 'aircraft',
    operator         TEXT        NOT NULL DEFAULT '',
    waveform_abbrevs TEXT[]      NOT NULL DEFAULT '{}',
    equipment_ids    TEXT[]      NOT NULL DEFAULT '{}',
    notes            TEXT        NOT NULL DEFAULT '',
    created_by       TEXT        NOT NULL DEFAULT '',
    updated_by       TEXT        NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- category and kind are deliberately NOT constrained to a fixed set, the same
-- decision transports made for kind in 033. The three categories and four kinds
-- the domain layer starts with are a vocabulary, not a closed one: a joint
-- exercise brings assets nobody anticipated - a coalition UAS, a harbour tug, a
-- fixed relay site - and filing those under 'other' loses the distinction the
-- matrix column exists to show. Shape is still enforced in the domain layer,
-- which normalises to lowercase and collapses internal whitespace, so 'Joint'
-- and 'joint' cannot both exist and the list cannot fill with one value spelled
-- three ways.
CREATE INDEX platforms_category_idx ON platforms (category);

-- Designation is the natural key: "F-35A", "DDG-51". Case-insensitive, so the
-- same airframe cannot be entered twice in two spellings.
CREATE UNIQUE INDEX platforms_designation_lower_idx ON platforms (lower(designation));

-- There is no join table to waveforms, and none to equipment. This schema has
-- no join tables at all: every cross-reference is either a single nullable FK
-- or a denormalised string, and both compatibility ideas already in the app -
-- the equipment editor's waveform chips and the PACE tier sources - tolerate an
-- orphan abbrev on purpose, because a waveform being renamed or retired must
-- not silently empty a platform's row.
--
-- The property that matters here is that a platform's waveform set lives in ONE
-- row. A join table would spread it across as many rows as the platform carries
-- radios, so reading "what can this airframe talk on" would mean an aggregate,
-- and a platform whose radios are unknown - which is the normal case for a
-- coalition asset - could not state its waveforms at all.

-- +goose Down
DROP TABLE IF EXISTS platforms;
