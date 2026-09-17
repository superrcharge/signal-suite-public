-- +goose Up
-- +goose StatementBegin

-- Which squadrons run a JEM/MPU5 comms card was a hardcoded list of five in
-- frontend/src/components/pace/pace-constants.ts, whose own comment said to
-- promote it to a column once it started changing. Adding HQ is it changing.
--
-- Default false, not true: a card is a deliberate choice about who produces one,
-- not a property every section has.
ALTER TABLE sections ADD COLUMN IF NOT EXISTS pace_enabled BOOLEAN NOT NULL DEFAULT false;

-- The five that had one before this migration, so behaviour is unchanged for
-- every existing database.
UPDATE sections SET pace_enabled = true WHERE key IN ('asqd', 'bsqd', 'csqd', 'dsqd', 'fsqd');

-- HQ is a starter section alongside the others: its own Nets library and its own
-- comms card. Seeded by migration rather than created by hand so every
-- environment agrees and a fresh database has it.
--
-- Colour: the existing starter sections already cover blue, green, purple,
-- orange, red, cyan, yellow and pink, leaving the yellow-green band at roughly
-- 90 degrees as the only gap wide enough to read as a distinct swatch at 10px.
-- Not lifted from Primer's core scale, which has nothing there. Checked against
-- the two reserved colours (#1f6feb Total tiles, #a371f7 On Mission) and the
-- three kit-type colours, since sections and kit types share a dashboard column.
INSERT INTO sections (key, label, color, pace_enabled)
VALUES ('hq', 'HQ', '#8fd14f', true)
ON CONFLICT (key) DO NOTHING;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM sections WHERE key = 'hq';
ALTER TABLE sections DROP COLUMN IF EXISTS pace_enabled;
-- +goose StatementEnd
