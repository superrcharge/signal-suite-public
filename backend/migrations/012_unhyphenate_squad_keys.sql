-- +goose Up
-- +goose StatementBegin

-- Original seed used "a-sqd", "b-sqd", etc. The hyphen was an artifact
-- of the label-to-key derivation (spaces → hyphen) at the time. Drop
-- the hyphen so users typing the key in CSV imports / URL bookmarks
-- type the simpler "asqd" form, matching the visual label "A SQD".
--
-- terminals.section IS a real FK to sections.key. To avoid a
-- chicken-and-egg lock with the FK during the rename, drop and
-- re-add the constraint around the updates. Also upgrade the FK to
-- ON UPDATE CASCADE so any future key rename propagates without
-- needing another bespoke migration. ON DELETE remains NO ACTION
-- (matching the original) - section delete is handled by the
-- DELETE /sections/:key endpoint with explicit reassignment, not
-- by the database.
--
-- Audit log entries that reference the old key names are
-- intentionally left untouched - they are historical snapshots.

ALTER TABLE terminals DROP CONSTRAINT terminals_section_fkey;

UPDATE sections
SET key = REPLACE(key, '-sqd', 'sqd')
WHERE key LIKE '%-sqd';

UPDATE terminals
SET section = REPLACE(section, '-sqd', 'sqd')
WHERE section LIKE '%-sqd';

ALTER TABLE terminals
    ADD CONSTRAINT terminals_section_fkey
    FOREIGN KEY (section) REFERENCES sections(key)
    ON UPDATE CASCADE;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE terminals DROP CONSTRAINT terminals_section_fkey;

UPDATE sections
SET key = REPLACE(key, 'sqd', '-sqd')
WHERE key LIKE '%sqd' AND key NOT LIKE '%-sqd';

UPDATE terminals
SET section = REPLACE(section, 'sqd', '-sqd')
WHERE section LIKE '%sqd' AND section NOT LIKE '%-sqd';

ALTER TABLE terminals
    ADD CONSTRAINT terminals_section_fkey
    FOREIGN KEY (section) REFERENCES sections(key);

-- +goose StatementEnd
