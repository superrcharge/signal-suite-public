-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS nets (
    id              UUID          NOT NULL PRIMARY KEY,
    name            VARCHAR(100)  NOT NULL,
    net_id          VARCHAR(50)   NOT NULL DEFAULT '',
    -- Which radio carries this net. 'both' is a first-class value, not a
    -- fallback: a genuinely shared net must not have to be entered twice, which
    -- is the duplication this library exists to prevent.
    radio_type      VARCHAR(10)   NOT NULL DEFAULT 'both',
    -- TX/RX are freeform text, not numerics: a net may be recorded as a range
    -- ("225.000 - 399.975") or as a placeholder word as readily as a single
    -- figure. freq_unit is the shared MHz/GHz toggle, matching
    -- equipment.data.bands[].freq_unit.
    tx_freq         VARCHAR(60)   NOT NULL DEFAULT '',
    rx_freq         VARCHAR(60)   NOT NULL DEFAULT '',
    freq_unit       VARCHAR(4)    NOT NULL DEFAULT 'MHz',
    waveform_abbrev VARCHAR(50)   NOT NULL DEFAULT '',
    description     TEXT          NOT NULL DEFAULT '',
    notes           TEXT          NOT NULL DEFAULT '',
    created_by      VARCHAR(200)  NOT NULL DEFAULT '',
    updated_by      VARCHAR(200)  NOT NULL DEFAULT '',
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness on name, matching the convention used by
-- terminals, kits, and waveforms.
CREATE UNIQUE INDEX nets_name_unique ON nets (LOWER(name));

-- Indexed for lookup by net ID. Not unique: two radios can carry the same one.
CREATE INDEX idx_nets_net_id ON nets (net_id);

-- The Nets Library is browsed one radio at a time.
CREATE INDEX idx_nets_radio_type ON nets (radio_type);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_nets_radio_type;
DROP INDEX IF EXISTS idx_nets_net_id;
DROP INDEX IF EXISTS nets_name_unique;
DROP TABLE IF EXISTS nets;
-- +goose StatementEnd
