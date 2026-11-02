-- +goose Up
-- +goose StatementBegin
CREATE TABLE operation_phases (
    id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    operation_id TEXT        NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    position     INT         NOT NULL,
    name         VARCHAR(60) NOT NULL
);

-- A phase name is unique within its operation, case-insensitively, so two
-- phases cannot be told apart only by spelling.
CREATE UNIQUE INDEX operation_phases_name_lower_idx ON operation_phases (operation_id, lower(name));

-- Deliberately NOT unique on (operation_id, position): the phases are replaced
-- as an ordered list, and a reorder rewrites several positions in one
-- statement, which a unique constraint would reject halfway through. The
-- service writes positions as the array index, so they are dense and distinct
-- by construction.
CREATE INDEX operation_phases_position_idx ON operation_phases (operation_id, position);

-- A row means "this asset is present in this phase". An asset with no row for a
-- phase is not there in that phase; an asset with no rows at all was brought to
-- the operation but sits in none of its phases.
--
-- asset_id is deliberately not a foreign key, for the reason the participant's
-- own id arrays are not: it names a platform, a catalog record or a transport,
-- three different tables, and one that was later deleted is kept rather than
-- silently dropped from a check-in. Deleting a participant or a phase takes its
-- rows with it.
CREATE TABLE operation_participant_asset_phases (
    participant_id TEXT NOT NULL REFERENCES operation_participants(id) ON DELETE CASCADE,
    asset_id       TEXT NOT NULL,
    phase_id       TEXT NOT NULL REFERENCES operation_phases(id) ON DELETE CASCADE,
    PRIMARY KEY (participant_id, asset_id, phase_id)
);

CREATE INDEX operation_participant_asset_phases_phase_idx ON operation_participant_asset_phases (phase_id);

-- Backfill. Every operation that exists gets the four default phases, which
-- mirror DefaultPhaseNames in the operation package and must be changed
-- together with it, and every asset a participant already brought is present
-- in all four, so nothing an operation showed before this migration changes.
INSERT INTO operation_phases (operation_id, position, name)
SELECT o.id, v.position, v.name
FROM operations o
CROSS JOIN (VALUES (0, 'Phase I'), (1, 'Phase II'), (2, 'Phase III'), (3, 'Phase IV')) AS v(position, name);

INSERT INTO operation_participant_asset_phases (participant_id, asset_id, phase_id)
SELECT a.participant_id, a.asset_id, ph.id
FROM (
    SELECT p.id AS participant_id, p.operation_id, x.asset_id
    FROM operation_participants p
    CROSS JOIN LATERAL (
        SELECT DISTINCT unnest(p.platform_ids || p.equipment_ids || p.transport_ids) AS asset_id
    ) x
) a
JOIN operation_phases ph ON ph.operation_id = a.operation_id;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS operation_participant_asset_phases;
DROP TABLE IF EXISTS operation_phases;
-- +goose StatementEnd
