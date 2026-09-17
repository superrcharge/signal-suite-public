-- +goose Up
-- +goose StatementBegin

-- SPT is a section alongside the others: its own Nets library and its own
-- comms card. Seeded by migration rather than created by hand so every
-- environment agrees and a fresh database has it, matching how HQ arrived in 036.
--
-- The key is the lowercased label, the same rule the app applies to a section
-- created in Settings.
--
-- Colour: indigo #818cf8, taken from SECTION_COLOR_PALETTE rather than invented.
-- The existing sections leave the band between A SQD blue (#388bfd) and
-- C SQD purple (#a371f7) empty, and that is the widest gap in the section hue
-- wheel. Because the hex is already enumerated in the palette, theme/
-- co-occurrence.ts needs no new KNOWN_COLLISIONS entry - that test reads the
-- palette constant, not the sections table.
INSERT INTO sections (key, label, color, pace_enabled)
VALUES ('spt', 'SPT', '#818cf8', true)
ON CONFLICT (key) DO NOTHING;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM sections WHERE key = 'spt';
-- +goose StatementEnd
