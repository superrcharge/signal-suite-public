-- +goose Up
-- +goose StatementBegin

-- The sheet's middle band: two frequency tables (LTAC and TACSAT) and the
-- TACTICAL MISSION NETWORK box. Every value is free-form text typed by the squadron.
--
-- Two tables rather than one with a discriminator: a TACTICAL MISSION NETWORK row is a
-- label and a value, while a frequency row is five named fields. Folding them
-- together would give every column two meanings depending on the block.
CREATE TABLE IF NOT EXISTS pace_freq_rows (
    id         UUID        NOT NULL PRIMARY KEY,
    section    VARCHAR(50) NOT NULL REFERENCES sections(key) ON UPDATE CASCADE,

    -- Which of the two tables this row prints in.
    block      VARCHAR(10) NOT NULL,

    -- Zero-based index within the block, assigned by the server from list
    -- order. The client never sends it, so it cannot create gaps or duplicates.
    position   INT         NOT NULL,

    name       VARCHAR(80) NOT NULL DEFAULT '',
    up_freq    VARCHAR(80) NOT NULL DEFAULT '',
    down_freq  VARCHAR(80) NOT NULL DEFAULT '',
    sat        VARCHAR(80) NOT NULL DEFAULT '',
    crypto     VARCHAR(80) NOT NULL DEFAULT '',

    CONSTRAINT pace_freq_rows_block_check CHECK (block IN ('ltac','tacsat')),
    CONSTRAINT pace_freq_rows_position_unique UNIQUE (section, block, position)
);

CREATE INDEX IF NOT EXISTS idx_pace_freq_rows_section ON pace_freq_rows (section);

-- TACTICAL MISSION NETWORK: a label and a value per line.
CREATE TABLE IF NOT EXISTS pace_tmn_rows (
    id       UUID         NOT NULL PRIMARY KEY,
    section  VARCHAR(50)  NOT NULL REFERENCES sections(key) ON UPDATE CASCADE,
    position INT          NOT NULL,
    label    VARCHAR(80)  NOT NULL DEFAULT '',
    value    VARCHAR(160) NOT NULL DEFAULT '',

    CONSTRAINT pace_tmn_rows_position_unique UNIQUE (section, position)
);

CREATE INDEX IF NOT EXISTS idx_pace_tmn_rows_section ON pace_tmn_rows (section);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS pace_tmn_rows;
DROP TABLE IF EXISTS pace_freq_rows;
-- +goose StatementEnd
