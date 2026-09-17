-- +goose Up
-- +goose StatementBegin

-- A channel number per frequency row. Added for the TACSAT table, which lists
-- the channel a frequency sits on; LTAC does not print the column today.
--
-- The column lives on pace_freq_rows rather than on a TACSAT-only table
-- because the two blocks are otherwise the same shape, and splitting them to
-- carry one extra field would give every other column two meanings depending
-- on which table it came from.
--
-- Free-form text, not an integer: these rows are printed values a squadron
-- types, the same as every other field here. A channel is as often "1-16" or
-- "A" as it is a single number.
ALTER TABLE pace_freq_rows
    ADD COLUMN IF NOT EXISTS channel VARCHAR(40) NOT NULL DEFAULT '';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE pace_freq_rows DROP COLUMN IF EXISTS channel;
-- +goose StatementEnd
