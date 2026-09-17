-- +goose Up
CREATE TABLE waveforms (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    abbrev      TEXT        NOT NULL,
    name        TEXT        NOT NULL DEFAULT '',
    description TEXT        NOT NULL DEFAULT '',
    created_by  TEXT        NOT NULL DEFAULT '',
    updated_by  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX waveforms_abbrev_lower_idx ON waveforms (lower(abbrev));

-- +goose Down
DROP TABLE IF EXISTS waveforms;
