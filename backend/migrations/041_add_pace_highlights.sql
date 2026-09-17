-- +goose Up
-- +goose StatementBegin

-- Changed-marks and a version label for the PACE card.
--
-- A squadron revises its card and hands it on; the person receiving it needs to
-- see what moved. Nothing here compares versions. The squadron marks a value
-- as changed by hand, the sheet prints that value red, and the marks are
-- cleared by hand when the next revision starts.
--
-- One array per row table rather than one list of positional keys on the card:
-- the band tables are a delete-and-reinsert with a server-assigned position, so
-- "LTAC row 2" would mark the wrong row the moment one above it was deleted.
-- Each row carries the names of its own marked fields, and the mark travels
-- with the row. The allowed names live in pace/model.go.
--
-- version is free text ("v2", "REV 3") printed after the effective date. The
-- empty string is "no version", the same convention emblem_url uses.
ALTER TABLE pace_plans
    ADD COLUMN IF NOT EXISTS version    VARCHAR(20) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS highlights TEXT[]      NOT NULL DEFAULT '{}';

ALTER TABLE channel_plans
    ADD COLUMN IF NOT EXISTS highlights TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE channel_assignments
    ADD COLUMN IF NOT EXISTS highlights TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE pace_freq_rows
    ADD COLUMN IF NOT EXISTS highlights TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE pace_tmn_rows
    ADD COLUMN IF NOT EXISTS highlights TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE pace_tiers
    ADD COLUMN IF NOT EXISTS highlights TEXT[] NOT NULL DEFAULT '{}';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE pace_tiers          DROP COLUMN IF EXISTS highlights;
ALTER TABLE pace_tmn_rows    DROP COLUMN IF EXISTS highlights;
ALTER TABLE pace_freq_rows      DROP COLUMN IF EXISTS highlights;
ALTER TABLE channel_assignments DROP COLUMN IF EXISTS highlights;
ALTER TABLE channel_plans       DROP COLUMN IF EXISTS highlights;
ALTER TABLE pace_plans          DROP COLUMN IF EXISTS highlights;
ALTER TABLE pace_plans          DROP COLUMN IF EXISTS version;
-- +goose StatementEnd
