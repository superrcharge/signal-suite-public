-- +goose Up
-- +goose StatementBegin

-- A platform's category is now the branch or branches that fly, sail or field
-- it, from a closed list: USA, USMC, USN, USAF, USSF, USCG, and OGA for an
-- agency inside the government but outside the military. It replaces two
-- columns that said less between them:
--
--   * category ('organic' | 'joint' | 'coalition', open) described the asset
--     relative to the reader, so the same F-15E was organic to one squadron
--     and joint to the next. The branch says what it is.
--   * operator (free text) already held the branch in practice - 'USAF',
--     'USN/USMC', 'SOCOM/USA' - but as prose, which the matrix had to parse on
--     every read and which no two people typed the same way.
--
-- An array because a platform is often flown by more than one branch: an F-35
-- by the Air Force, Navy and Marine Corps is one airframe, not three rows.
--
-- The operator field is converted rather than discarded. Each token is split
-- on / , ; and mapped:
--   * a branch abbreviation (and ARNG / ANG, the Guard components) -> its branch
--   * SOCOM -> dropped. It is a combatant command, not a branch; a SOCOM/USA
--     platform keeps USA. A platform listing SOCOM alone ends with no branch
--     and needs one set by hand, which the Platform Library shows as a blank.
--   * anything else (CBP, NASA, NOAA, State...) -> OGA.
-- Repeats collapse and the result is stored in order of precedence - USA,
-- USMC, USN, USAF, USSF, USCG, then OGA - the same order the API normalises
-- to, so a row's chips read the same way however its operator was typed:
-- 'CBP/USA' becomes {USA, OGA} and 'CBP/NASA' becomes {OGA}.

ALTER TABLE platforms ADD COLUMN IF NOT EXISTS branches TEXT[] NOT NULL DEFAULT '{}';

WITH tokens AS (
    SELECT p.id,
           CASE upper(btrim(t.tok))
               WHEN 'USA'   THEN 'USA'
               WHEN 'ARNG'  THEN 'USA'
               WHEN 'USMC'  THEN 'USMC'
               WHEN 'USN'   THEN 'USN'
               WHEN 'USAF'  THEN 'USAF'
               WHEN 'ANG'   THEN 'USAF'
               WHEN 'USSF'  THEN 'USSF'
               WHEN 'USCG'  THEN 'USCG'
               WHEN 'SOCOM' THEN NULL
               ELSE 'OGA'
           END AS branch
    FROM platforms p,
         LATERAL regexp_split_to_table(p.operator, '[/,;]') AS t(tok)
    WHERE btrim(t.tok) <> ''
),
distinct_branches AS (
    SELECT DISTINCT id, branch FROM tokens WHERE branch IS NOT NULL
)
UPDATE platforms p
SET branches = agg.branches
FROM (
    SELECT id,
           array_agg(branch ORDER BY array_position(
               ARRAY['USA', 'USMC', 'USN', 'USAF', 'USSF', 'USCG', 'OGA']::TEXT[], branch)) AS branches
    FROM distinct_branches GROUP BY id
) agg
WHERE p.id = agg.id;

DROP INDEX IF EXISTS platforms_category_idx;
ALTER TABLE platforms DROP COLUMN IF EXISTS category;
ALTER TABLE platforms DROP COLUMN IF EXISTS operator;
ALTER TABLE platforms RENAME COLUMN branches TO category;

-- Closed, unlike kind: the set of branches is not something an exercise
-- extends. <@ is "every element is one of these", and an empty array passes,
-- which is what a platform with no branch set yet stores.
ALTER TABLE platforms ADD CONSTRAINT platforms_category_branches_check
    CHECK (category <@ ARRAY['USA', 'USMC', 'USN', 'USAF', 'USSF', 'USCG', 'OGA']::TEXT[]);

-- GIN, because the matrix filter asks "does this platform carry any of these
-- branches", which is an array overlap rather than an equality.
CREATE INDEX platforms_category_idx ON platforms USING GIN (category);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- The branches go back into operator as the '/'-joined prose they came from.
-- organic/joint cannot be recovered - nothing recorded which a row was - so
-- every row comes back as 'joint', the old column default.
DROP INDEX IF EXISTS platforms_category_idx;
ALTER TABLE platforms DROP CONSTRAINT IF EXISTS platforms_category_branches_check;
ALTER TABLE platforms RENAME COLUMN category TO branches;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'joint';
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS operator TEXT NOT NULL DEFAULT '';
UPDATE platforms SET operator = array_to_string(branches, '/');
ALTER TABLE platforms DROP COLUMN IF EXISTS branches;
CREATE INDEX platforms_category_idx ON platforms (category);

-- +goose StatementEnd
