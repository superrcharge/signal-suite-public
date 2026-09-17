-- +goose Up
-- +goose StatementBegin

-- The Nets Library no longer records a waveform. The field was removed from net
-- configuration because it did not earn its place there, which left the column,
-- its write-time validation, and the delete guard protecting it all serving
-- nothing. Dormant machinery is worse than absent machinery -- it reads as
-- intentional to whoever finds it next.
--
-- The Waveform Library itself is untouched: equipment still references it, which
-- is where waveforms actually earn their keep.
ALTER TABLE nets DROP COLUMN IF EXISTS waveform_abbrev;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE nets ADD COLUMN waveform_abbrev VARCHAR(50) NOT NULL DEFAULT '';
-- +goose StatementEnd
