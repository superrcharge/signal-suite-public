-- +goose Up
-- +goose StatementBegin

-- A collation that orders digit runs numerically, so a name that reaches double
-- digits stops interleaving. Plain text ordering gives "MINI 1, MINI 10, MINI 11,
-- MINI 2, MINI 9"; under this collation it gives "MINI 1, MINI 2, MINI 9, MINI 10,
-- MINI 11". The zero-padded records seeded earlier (MINI-001) hid this for eight
-- releases, because padding makes text order accidentally correct.
--
-- `en-u-kn` is a BCP 47 tag: `kn` is the ICU numeric-ordering key. This is the same
-- ICU behaviour as the frontend's `Intl.Collator(undefined, { numeric: true })`,
-- which is what orders the Equipment Catalog and the waveform/service indexes in
-- JavaScript. The two halves are kept deliberately identical - a name sorted
-- server-side and the same name sorted client-side must not disagree.
--
-- Three decisions worth recording, each of which was measured rather than assumed:
--
-- 1. The name is `natural_sort`, NOT `natural`. NATURAL is a reserved SQL keyword
--    (NATURAL JOIN), so `CREATE COLLATION natural` fails to parse outright:
--    ERROR: syntax error at or near "natural".
--
-- 2. Deterministic - note the ABSENCE of `deterministic = false`. Numeric ordering
--    does not require a nondeterministic collation, and the deterministic form is
--    strictly better here: a nondeterministic one cannot back LIKE/ILIKE, loses
--    B-tree deduplication, and would let two byte-different names ('T1' and 'T01')
--    compare equal - which under LIMIT/OFFSET pagination can duplicate a row on one
--    page and skip it on another. Deterministic falls back to bitwise comparison as
--    a tiebreaker, so ordering stays total.
--
-- 3. It is applied ONLY in ORDER BY clauses, never as a column default. That
--    scoping is what leaves everything else alone: search is
--    `name ILIKE '%' || $1 || '%'` in a WHERE clause and takes its collation from
--    the column, and the uniqueness rules are UNIQUE btree (LOWER(name)) expression
--    indexes. Attaching this to the columns would change both.
--
-- It composes with the lower() that equipment, nets, transports, services and
-- waveforms already order by: `ORDER BY lower(name) COLLATE natural_sort` keeps
-- their case-insensitivity and adds numeric ordering.
--
-- No table is read or written by this migration; it adds one entry to pg_collation.
CREATE COLLATION IF NOT EXISTS natural_sort (provider = icu, locale = 'en-u-kn');

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Fails while any query still references it, so a rollback needs the code reverted
-- first. That ordering is correct: dropping the collation out from under a live
-- ORDER BY would break every list instead of reverting it.
DROP COLLATION IF EXISTS natural_sort;

-- +goose StatementEnd
