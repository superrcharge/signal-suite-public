-- +goose Up
CREATE TABLE services (
    id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    abbrev      TEXT        NOT NULL,
    name        TEXT        NOT NULL DEFAULT '',
    description TEXT        NOT NULL DEFAULT '',
    created_by  TEXT        NOT NULL DEFAULT '',
    updated_by  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Matched case-insensitively so GX and gx cannot both exist. The frontend
-- reverse index normalizes the same way.
CREATE UNIQUE INDEX services_abbrev_lower_idx ON services (lower(abbrev));

-- Backfill from the equipment records that already carry hand-typed services.
-- Without this every existing SATCOM terminal would show its services as
-- orphan chips on day one. jsonb_typeof guards the rows whose data->'services'
-- is absent or not an array; DISTINCT ON collapses case variants, keeping the
-- spelling that carried the longest name.
INSERT INTO services (abbrev, name, description, created_by, updated_by)
SELECT DISTINCT ON (lower(trim(s->>'abbrev')))
       trim(s->>'abbrev'),
       COALESCE(s->>'name', ''),
       COALESCE(s->>'description', ''),
       'migration', 'migration'
FROM equipment e
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(e.data->'services') = 'array'
         THEN e.data->'services' ELSE '[]'::jsonb END
) AS s
WHERE COALESCE(trim(s->>'abbrev'), '') <> ''
ORDER BY lower(trim(s->>'abbrev')), length(COALESCE(s->>'name', '')) DESC;

-- +goose Down
DROP TABLE IF EXISTS services;
