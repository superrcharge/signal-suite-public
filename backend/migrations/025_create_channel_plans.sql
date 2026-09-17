-- +goose Up
-- +goose StatementBegin

-- One wheel: a squadron's channel assignments for one radio.
CREATE TABLE IF NOT EXISTS channel_plans (
    id            UUID         NOT NULL PRIMARY KEY,
    section       VARCHAR(50)  NOT NULL REFERENCES sections(key) ON UPDATE CASCADE,
    radio_type    VARCHAR(20)  NOT NULL,           -- 'jem' | 'mpu5'
    -- Free-text caption rendered beneath the wheel. Empty renders no caption at
    -- all, so a squadron that does not want one is not forced to have one.
    label         VARCHAR(60)  NOT NULL DEFAULT '',
    -- A column rather than a constant, so a radio with a different number of
    -- positions needs data, not a migration.
    channel_count SMALLINT     NOT NULL DEFAULT 16 CHECK (channel_count BETWEEN 1 AND 64),
    notes         TEXT         NOT NULL DEFAULT '',
    updated_by    VARCHAR(200) NOT NULL DEFAULT '',
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- One JEM wheel and one MPU5 wheel per squadron. Multiple named plans per
    -- squadron would mean dropping this and adding a name column -- additive,
    -- not a restructure.
    UNIQUE (section, radio_type)
);

-- Which net sits on which position. Only assigned channels get a row; the UI
-- renders 1..channel_count and fills the gaps with the unassigned placeholder,
-- so an empty wheel is zero rows rather than sixteen blank ones.
CREATE TABLE IF NOT EXISTS channel_assignments (
    plan_id            UUID     NOT NULL REFERENCES channel_plans(id) ON DELETE CASCADE,
    channel_number     SMALLINT NOT NULL CHECK (channel_number >= 1),

    -- RESTRICT, not CASCADE or SET NULL. A net sitting on a wheel must not
    -- vanish out from under a printed comms card. The equivalent soft link on
    -- equipment.data.waveforms accumulates orphans precisely because nothing
    -- enforces this; here the database refuses the delete outright.
    net_id             UUID     NOT NULL REFERENCES nets(id) ON DELETE RESTRICT,

    -- Per-channel overrides. A net normally carries its own frequency, so these
    -- are the exception: the same net running on a different frequency for this
    -- squadron's wheel only.
    tx_freq_override   VARCHAR(60) NOT NULL DEFAULT '',
    rx_freq_override   VARCHAR(60) NOT NULL DEFAULT '',
    freq_unit_override VARCHAR(4)  NOT NULL DEFAULT '',
    label_override     VARCHAR(60) NOT NULL DEFAULT '',

    PRIMARY KEY (plan_id, channel_number)
);

-- Answers "which plans reference this net?", which is what turns a blocked
-- delete into a message naming the wheels that would break.
CREATE INDEX idx_channel_assignments_net ON channel_assignments (net_id);

-- The card is always read a whole squadron at a time.
CREATE INDEX idx_channel_plans_section ON channel_plans (section);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_channel_plans_section;
DROP INDEX IF EXISTS idx_channel_assignments_net;
DROP TABLE IF EXISTS channel_assignments;
DROP TABLE IF EXISTS channel_plans;
-- +goose StatementEnd
