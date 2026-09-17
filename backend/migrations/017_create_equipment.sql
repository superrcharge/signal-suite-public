-- +goose Up
CREATE TABLE equipment (
    id               TEXT        PRIMARY KEY,
    nomenclature     TEXT        NOT NULL,
    nickname         TEXT,
    one_liner        TEXT,
    doc_number       TEXT,
    photo_url        TEXT,
    make             TEXT,
    terminal_type    TEXT        NOT NULL DEFAULT 'satcom',
    operational_mode TEXT[]      NOT NULL DEFAULT '{}',
    data             JSONB       NOT NULL DEFAULT '{}',
    created_by       TEXT        NOT NULL DEFAULT '',
    updated_by       TEXT        NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX equipment_terminal_type_idx ON equipment (terminal_type);
CREATE INDEX equipment_nomenclature_idx  ON equipment (lower(nomenclature));

-- +goose Down
DROP TABLE IF EXISTS equipment;
