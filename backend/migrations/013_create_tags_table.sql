-- +goose Up
-- +goose StatementBegin

-- Catalog of known tags for the Settings panel management UI.
-- Tags on terminals remain free-form VARCHAR(100); this table lets
-- admins/editors pre-define and delete tags without needing to hunt
-- through individual terminal drawers.
CREATE TABLE IF NOT EXISTS tags (
    name        VARCHAR(100)    NOT NULL,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    CONSTRAINT tags_pkey PRIMARY KEY (name)
);

-- Case-insensitive uniqueness: 'Op-Alpha' and 'op-alpha' are the same tag.
CREATE UNIQUE INDEX tags_name_lower_unique ON tags (LOWER(name));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS tags;

-- +goose StatementEnd
