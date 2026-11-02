-- +goose Up
-- +goose StatementBegin
ALTER TABLE operation_participants ALTER COLUMN organization_key DROP NOT NULL;
ALTER TABLE operation_participants
    ADD COLUMN adhoc_name        VARCHAR(120) NOT NULL DEFAULT '',
    ADD COLUMN adhoc_short_label VARCHAR(20)  NOT NULL DEFAULT '',
    ADD COLUMN adhoc_branch      VARCHAR(8)   NULL,
    ADD COLUMN adhoc_color       VARCHAR(20)  NOT NULL DEFAULT '';
ALTER TABLE operation_participants
    ADD CONSTRAINT operation_participants_adhoc_branch_check
        CHECK (adhoc_branch IS NULL OR adhoc_branch IN ('USA','USMC','USN','USAF','USSF','USCG','OGA')),
    ADD CONSTRAINT operation_participants_one_identity
        CHECK ((organization_key IS NOT NULL AND adhoc_name = '') OR (organization_key IS NULL AND adhoc_name <> ''));
CREATE UNIQUE INDEX operation_participants_adhoc_unique
    ON operation_participants (operation_id, lower(adhoc_name)) WHERE organization_key IS NULL;

-- A participant may be an "Other" organization: a one-off partner named only
-- inside one operation. Its name, label, branch and color live on the
-- participant row, so such a partner never grows the enterprise organization
-- list and disappears with the operation.
--
-- Exactly one identity per row: either a library organization_key with no
-- ad hoc name, or no key and a non-empty ad hoc name
-- (operation_participants_one_identity).
--
-- The existing UNIQUE (operation_id, organization_key) still holds for library
-- organizations because NULLs do not collide in a unique constraint; ad hoc
-- names are kept unique per operation, case-insensitively, by the partial
-- index above. The branch CHECK is the same list as migration 046's.
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Destructive for ad hoc rows: they have no organization_key to keep, so they
-- are deleted before the NOT NULL is restored.
DROP INDEX IF EXISTS operation_participants_adhoc_unique;
ALTER TABLE operation_participants
    DROP CONSTRAINT IF EXISTS operation_participants_one_identity,
    DROP CONSTRAINT IF EXISTS operation_participants_adhoc_branch_check;
DELETE FROM operation_participants WHERE organization_key IS NULL;
ALTER TABLE operation_participants
    DROP COLUMN adhoc_color,
    DROP COLUMN adhoc_branch,
    DROP COLUMN adhoc_short_label,
    DROP COLUMN adhoc_name;
ALTER TABLE operation_participants ALTER COLUMN organization_key SET NOT NULL;
-- +goose StatementEnd
