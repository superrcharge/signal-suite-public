-- +goose Up
CREATE TABLE transports (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name        TEXT        NOT NULL,
    kind        TEXT        NOT NULL DEFAULT 'other',
    provider    TEXT        NOT NULL DEFAULT '',
    description TEXT        NOT NULL DEFAULT '',
    created_by  TEXT        NOT NULL DEFAULT '',
    updated_by  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- kind is deliberately NOT constrained to a fixed set. The four built-in kinds
-- are a starting vocabulary, not a closed one: a squadron that runs a path
-- nobody anticipated adds its own rather than filing it under 'other' and
-- losing the distinction. Shape is still enforced in the domain layer, which
-- normalises to lowercase so 'Cellular' and 'cellular' cannot both exist.
CREATE INDEX transports_kind_idx ON transports (kind);

CREATE UNIQUE INDEX transports_name_lower_idx ON transports (lower(name));

-- +goose Down
DROP TABLE IF EXISTS transports;
