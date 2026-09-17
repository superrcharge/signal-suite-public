-- +goose Up
-- +goose StatementBegin

-- The four PACE tiles at the bottom of the sheet: Primary, Alternate,
-- Contingency, Emergency.
--
-- A tier is one of three things, which is what `source` records. Most often it
-- is a terminal from the Equipment Catalog together with one of the services
-- that terminal carries. Sometimes it is a fibre circuit, a cellular plan or a
-- MANET mesh, which is what the Transport Library exists to name. Occasionally
-- it is neither and the squadron types a line of text.
--
-- One row per (section, tier). A squadron that has configured none has no rows
-- at all; the read pads to four so the response shape is constant.
CREATE TABLE IF NOT EXISTS pace_tiers (
    id           UUID         NOT NULL PRIMARY KEY,
    section      VARCHAR(50)  NOT NULL REFERENCES sections(key) ON UPDATE CASCADE,

    tier         CHAR(1)      NOT NULL,
    source       VARCHAR(12)  NOT NULL DEFAULT 'none',

    -- ON DELETE SET NULL, never CASCADE: deleting a catalog terminal must not
    -- silently delete a squadron's whole PACE tier. The tier survives with a
    -- dangling reference cleared, which is visible in the editor.
    equipment_id TEXT         NULL REFERENCES equipment(id) ON DELETE SET NULL,
    transport_id TEXT         NULL REFERENCES transports(id) ON DELETE SET NULL,

    -- A string rather than a foreign key into services, because the rates the
    -- sheet prints live on the equipment record's own services array and are
    -- matched by abbreviation.
    service_abbrev VARCHAR(40)  NOT NULL DEFAULT '',

    custom_label VARCHAR(120) NOT NULL DEFAULT '',
    -- Printed under the name whatever the source is.
    detail       VARCHAR(200) NOT NULL DEFAULT '',

    updated_by   VARCHAR(255) NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pace_tiers_tier_check   CHECK (tier IN ('P','A','C','E')),
    CONSTRAINT pace_tiers_source_check CHECK (source IN ('equipment','transport','custom','none')),
    CONSTRAINT pace_tiers_section_tier_unique UNIQUE (section, tier)
);

CREATE INDEX IF NOT EXISTS idx_pace_tiers_section ON pace_tiers (section);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS pace_tiers;
-- +goose StatementEnd
