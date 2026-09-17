-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS kits (
    id          UUID         NOT NULL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    type        VARCHAR(20)  NOT NULL,
    status      VARCHAR(50)  NOT NULL DEFAULT 'available',
    black       BOOLEAN      NOT NULL DEFAULT false,
    secret       BOOLEAN      NOT NULL DEFAULT false,
    topsecret        BOOLEAN      NOT NULL DEFAULT false,
    section     VARCHAR(50)  NULL REFERENCES sections(key) ON UPDATE CASCADE,
    owner       VARCHAR(100) NULL,
    owner_email VARCHAR(200) NULL,
    owner_phone VARCHAR(50)  NULL,
    location    VARCHAR(200) NOT NULL DEFAULT '',
    notes       TEXT         NOT NULL DEFAULT '',
    updated_by  VARCHAR(200) NOT NULL DEFAULT '',
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness on name, matching the terminals convention.
CREATE UNIQUE INDEX kits_name_unique ON kits (LOWER(name));
CREATE INDEX idx_kits_section ON kits(section);
CREATE INDEX idx_kits_type    ON kits(type);
CREATE INDEX idx_kits_name    ON kits(name);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_kits_name;
DROP INDEX IF EXISTS idx_kits_type;
DROP INDEX IF EXISTS idx_kits_section;
DROP INDEX IF EXISTS kits_name_unique;
DROP TABLE IF EXISTS kits;
-- +goose StatementEnd
