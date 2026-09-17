-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS terminals (
    id          UUID         NOT NULL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    kit         VARCHAR(100) NOT NULL DEFAULT '',
    serial      VARCHAR(100) NOT NULL DEFAULT '',
    section     VARCHAR(50)  NULL REFERENCES sections(key),
    status      VARCHAR(50)  NOT NULL DEFAULT 'available',
    owner       VARCHAR(100) NULL,
    owner_email VARCHAR(200) NULL,
    owner_phone VARCHAR(50)  NULL,
    notes       TEXT         NOT NULL DEFAULT '',
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_terminals_section ON terminals(section);
CREATE INDEX idx_terminals_name    ON terminals(name);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_terminals_name;
DROP INDEX IF EXISTS idx_terminals_section;
DROP TABLE IF EXISTS terminals;
-- +goose StatementEnd
