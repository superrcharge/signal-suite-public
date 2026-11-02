-- +goose Up
-- +goose StatementBegin
CREATE TABLE organizations (
    key          VARCHAR(50)  NOT NULL PRIMARY KEY,   -- lowercase slug, immutable (no rename route)
    name         TEXT         NOT NULL,
    short_label  VARCHAR(20)  NOT NULL DEFAULT '',
    branch       VARCHAR(8)   NULL,                   -- NULL means not a service component
    color        VARCHAR(20)  NOT NULL DEFAULT '',    -- same width as sections.color
    section_key  VARCHAR(50)  NULL REFERENCES sections(key) ON UPDATE CASCADE ON DELETE SET NULL,
    notes        TEXT         NOT NULL DEFAULT '',
    created_by   TEXT         NOT NULL DEFAULT '',
    updated_by   TEXT         NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT organizations_branch_check CHECK (branch IS NULL OR branch IN ('USA','USMC','USN','USAF','USSF','USCG','OGA')),
    CONSTRAINT organizations_section_key_unique UNIQUE (section_key)
);

-- An organization is a participant in an operation: a service component, a
-- squadron, a coalition partner. The key is a lowercase slug that never changes
-- once created, because operation_participants (047) points at it and the
-- library has no rename route. Names are unique case-insensitively, so the same
-- organization cannot be entered twice in two spellings.
CREATE UNIQUE INDEX organizations_name_lower_idx ON organizations (lower(name));

-- branch reuses the closed vocabulary migration 044 enforces on platforms, but
-- as a single nullable value: NULL means the organization is not a service
-- component at all (a coalition partner, a contractor).
--
-- section_key optionally ties an organization to one of the app's squadrons, so
-- a later stage can pre-fill a check-in from that squadron's own data. It is
-- unique, because two organizations claiming one squadron would make that
-- pre-fill ambiguous, and SET NULL, because deleting a section must not be
-- blocked by, or cascade into, a reference library.

-- The enterprise's member list is prebuilt by the maintainer and is loaded
-- later. These nine are placeholders so the library is not empty and the
-- operations stage has something to check in against until that list lands.
INSERT INTO organizations (key, name, short_label, color) VALUES
    ('green',  'Green',  'GREEN',  '#2E7D32'),
    ('blue',   'Blue',   'BLUE',   '#1565C0'),
    ('white',  'White',  'WHITE',  '#E0E0E0'),
    ('orange', 'Orange', 'ORANGE', '#EF6C00'),
    ('red',    'Red',    'RED',    '#C62828'),
    ('brown',  'Brown',  'BROWN',  '#6D4C41'),
    ('gold',   'Gold',   'GOLD',   '#F9A825'),
    ('purple', 'Purple', 'PURPLE', '#6A1B9A'),
    ('silver', 'Silver', 'SILVER', '#B0BEC5');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS organizations;
-- +goose StatementEnd
