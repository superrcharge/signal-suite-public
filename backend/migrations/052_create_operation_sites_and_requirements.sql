-- +goose Up
-- +goose StatementBegin
-- A site is a place on the ground (an ISB, an FSB, an MSS, "the X") that units
-- sit at. The list belongs to the operation, in order. There is no backfill:
-- an operation that exists starts with no sites, nothing placed and no
-- requirements, so nothing it showed before this migration changes.
CREATE TABLE operation_sites (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    operation_id TEXT        NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    position     INT         NOT NULL,
    name         VARCHAR(60) NOT NULL
);

-- A site name is unique within its operation, case-insensitively, as a phase
-- name is.
CREATE UNIQUE INDEX operation_sites_name_lower_idx ON operation_sites (operation_id, lower(name));

-- Deliberately NOT unique on (operation_id, position), for the reason
-- operation_phases_position_idx gives: a reorder rewrites several positions in
-- one statement.
CREATE INDEX operation_sites_position_idx ON operation_sites (operation_id, position);

-- The unit a phase exists to support, usually the assault force. NULL for none,
-- and SET NULL rather than CASCADE: a phase outlives the unit it was supporting.
ALTER TABLE operation_phases
    ADD COLUMN supported_participant_id TEXT NULL REFERENCES operation_participants(id) ON DELETE SET NULL;

CREATE INDEX operation_phases_supported_idx ON operation_phases (supported_participant_id);

-- Where a unit sits in a phase. One row per (phase, participant); a unit with
-- no row is not placed ("No location"). The site belongs to the same operation
-- as the phase, which the service checks and a foreign key cannot say.
CREATE TABLE operation_phase_placements (
    phase_id       TEXT NOT NULL REFERENCES operation_phases(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL REFERENCES operation_participants(id) ON DELETE CASCADE,
    site_id        TEXT NOT NULL REFERENCES operation_sites(id) ON DELETE CASCADE,
    PRIMARY KEY (phase_id, participant_id)
);

CREATE INDEX operation_phase_placements_participant_idx ON operation_phase_placements (participant_id);
CREATE INDEX operation_phase_placements_site_idx ON operation_phase_placements (site_id);

-- "These two units must be able to talk in this phase." An unordered pair, kept
-- as a < b so one pair has one row: the CHECK refuses a == b and a > b, and the
-- unique key refuses a repeat.
CREATE TABLE operation_requirements (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    phase_id      TEXT NOT NULL REFERENCES operation_phases(id) ON DELETE CASCADE,
    participant_a TEXT NOT NULL REFERENCES operation_participants(id) ON DELETE CASCADE,
    participant_b TEXT NOT NULL REFERENCES operation_participants(id) ON DELETE CASCADE,
    CONSTRAINT operation_requirements_ordered CHECK (participant_a < participant_b),
    CONSTRAINT operation_requirements_pair_key UNIQUE (phase_id, participant_a, participant_b)
);

CREATE INDEX operation_requirements_a_idx ON operation_requirements (participant_a);
CREATE INDEX operation_requirements_b_idx ON operation_requirements (participant_b);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS operation_requirements;
DROP TABLE IF EXISTS operation_phase_placements;
ALTER TABLE operation_phases DROP COLUMN IF EXISTS supported_participant_id;
DROP TABLE IF EXISTS operation_sites;
-- +goose StatementEnd
