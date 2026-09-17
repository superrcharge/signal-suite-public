-- +goose Up
-- +goose StatementBegin

-- Tagging had two disconnected sources of truth: the free-form terminals.tag
-- column (011) and the tags catalog (013). Nothing wrote the catalog except the
-- Settings "Add tag" button, so a tag typed on a terminal never appeared in
-- Settings and a tag created in Settings never appeared in the drawer.
--
-- From here the service registers every saved tag in the catalog and stores the
-- catalog's casing on the terminal, so exactly one spelling exists per tag.
-- This migration backfills the tags that predate that, then collapses the
-- casing variants already in the column.
--
-- ON CONFLICT DO NOTHING carries NO conflict target on purpose. The table has
-- two arbiters (tags_pkey on name, and the tags_name_lower_unique expression
-- index on LOWER(name)) and an ON CONFLICT clause can name only one of them.
-- Omitting the target makes every unique violation on the table take the
-- alternative action, which is the only form that covers both.
--
-- DISTINCT ON (LOWER(tag)) rather than DISTINCT tag: 'Op Alpha' and 'op alpha'
-- are two column values but one tag. The ORDER BY picks the winner by earliest
-- use, which is a decision recorded here rather than left to insertion order.
-- DISTINCT ON requires its expression to lead the ORDER BY; dropping that
-- clause would make the surviving casing arbitrary.
INSERT INTO tags (name)
SELECT DISTINCT ON (LOWER(t.tag)) t.tag
FROM terminals t
WHERE t.tag IS NOT NULL AND t.tag <> ''
ORDER BY LOWER(t.tag), t.created_at, t.tag
ON CONFLICT DO NOTHING;

-- Collapse the existing casing variants onto the catalog spelling. Without this
-- the backfill leaves 'op alpha' on a terminal whose catalog entry reads
-- 'Op Alpha', and the two disagree on screen until that terminal is next saved.
UPDATE terminals te
SET tag = t.name
FROM tags t
WHERE LOWER(te.tag) = LOWER(t.name) AND te.tag <> t.name;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Deliberately a no-op, and the statement below exists only because goose needs
-- one inside the block. After this migration a backfilled catalog row is
-- indistinguishable from one an editor typed into Settings, and the original
-- casing of a rewritten terminal tag is not recoverable, so a real Down would
-- delete an editor's work rather than undo this. Reverting the code leaves
-- harmless extra catalog rows and canonical casing behind.
SELECT 1;

-- +goose StatementEnd
