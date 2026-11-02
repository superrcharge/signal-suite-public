-- +goose Up
-- +goose StatementBegin
CREATE TABLE operations (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'planning',
    start_date  DATE NULL,
    end_date    DATE NULL,
    notes       TEXT NOT NULL DEFAULT '',
    created_by  TEXT NOT NULL DEFAULT '',
    updated_by  TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT operations_status_check CHECK (status IN ('planning','active','complete')),
    CONSTRAINT operations_dates_check  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

-- Names are unique case-insensitively, so one operation cannot be entered twice
-- in two spellings. Status is closed and the CHECK is the same list as
-- ValidStatuses in the operation package.
CREATE UNIQUE INDEX operations_name_lower_idx ON operations (lower(name));

CREATE TABLE operation_participants (
    id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    operation_id     TEXT        NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    organization_key VARCHAR(50) NOT NULL REFERENCES organizations(key) ON UPDATE CASCADE ON DELETE RESTRICT,
    equipment_ids    TEXT[] NOT NULL DEFAULT '{}',   -- equipment.id slugs, satcom and radio; no FK, like platforms.equipment_ids
    waveform_abbrevs TEXT[] NOT NULL DEFAULT '{}',   -- direct picks, validated against the waveform library on write
    service_abbrevs  TEXT[] NOT NULL DEFAULT '{}',   -- direct picks, plain strings like pace_tiers.service_abbrev
    transport_ids    TEXT[] NOT NULL DEFAULT '{}',
    poc_name   VARCHAR(120) NOT NULL DEFAULT '',
    poc_phone  VARCHAR(40)  NOT NULL DEFAULT '',
    poc_email  VARCHAR(255) NOT NULL DEFAULT '',
    notes      TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT operation_participants_unique UNIQUE (operation_id, organization_key)
);

-- A participant row is an organization's check-in to one operation: what it
-- brings (terminals and radios, waveforms, services, transports) and who to
-- call. One row per organization per operation, which is the UNIQUE above.
--
-- Two deletes, two different rules:
--   * An operation owns its check-ins, so deleting the operation CASCADEs.
--   * An organization that is checked in somewhere cannot be deleted
--     (RESTRICT). The organization service asks the operation service first and
--     names the operations; the constraint is the backstop for a service built
--     without that wiring.
--
-- The four lists are arrays of ids with no join tables, for the reason
-- migration 040 gives for platforms: a participant's whole kit lives in ONE
-- row, so reading "what does this organization bring" is a single row read
-- rather than an aggregate, and an organization whose kit is not yet known
-- can still check in with empty lists. Only waveform abbrevs are validated,
-- in the service, because the waveform library is the one list the app
-- already refuses an unknown member of.
CREATE INDEX operation_participants_org_idx ON operation_participants (organization_key);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS operation_participants;
DROP TABLE IF EXISTS operations;
-- +goose StatementEnd
