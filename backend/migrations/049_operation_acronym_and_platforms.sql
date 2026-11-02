-- +goose Up
-- +goose StatementBegin
ALTER TABLE operations ADD COLUMN acronym VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE operation_participants ADD COLUMN platform_ids TEXT[] NOT NULL DEFAULT '{}';

-- An operation may carry an optional acronym so it can show as "Operation XXX".
-- The date range is no longer shown, but start_date and end_date stay with
-- their defaults and nothing is removed.
--
-- A participant declares the platforms it brings (airframe, ship, vehicle,
-- ground station) before its radios, because a platform carries its own
-- waveforms and radios.
--
-- platform_ids is an id array with no foreign key, exactly like equipment_ids
-- (the platform precedent, migration 040): an id naming a platform deleted
-- later is kept rather than blocking the delete.
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE operation_participants DROP COLUMN IF EXISTS platform_ids;
ALTER TABLE operations DROP COLUMN IF EXISTS acronym;
-- +goose StatementEnd
