-- +goose Up
-- +goose StatementBegin

-- A platform's kind becomes its type, from a fixed list: aircraft, ship,
-- ground vehicle, ground station.
--
-- Renamed because "type" is the word the people using the library say, and
-- nothing has shipped under "kind" since the branch category (044) that this
-- lands beside. Closed because an open vocabulary let a free-text value in
-- through import - "launch platform", on one row - and every such value became
-- a filter chip on the library and the matrix.
--
-- Values are normalised the way the domain layer does (trim, lowercase,
-- underscores to spaces, repeated whitespace collapsed), and anything still
-- outside the four becomes 'ground station', the nearest fit for the fixed
-- sites such values described.
-- On the dev database there were none left by the time this ran.

ALTER TABLE platforms RENAME COLUMN kind TO type;

UPDATE platforms SET type = lower(btrim(regexp_replace(replace(type, '_', ' '), '\s+', ' ', 'g')));
UPDATE platforms SET type = 'ground station'
    WHERE type NOT IN ('aircraft', 'ship', 'ground vehicle', 'ground station');

ALTER TABLE platforms ADD CONSTRAINT platforms_type_check
    CHECK (type IN ('aircraft', 'ship', 'ground vehicle', 'ground station'));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- The column goes back to kind, open again. A value remapped to
-- 'ground station' on the way up is not restored: nothing recorded what it was.
ALTER TABLE platforms DROP CONSTRAINT IF EXISTS platforms_type_check;
ALTER TABLE platforms RENAME COLUMN type TO kind;

-- +goose StatementEnd
