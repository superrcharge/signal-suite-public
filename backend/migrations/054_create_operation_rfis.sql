-- +goose Up
-- +goose StatementBegin
-- An RFI is a request for information one unit raises to the others on an
-- operation. participant_id is the unit it was raised as, picked from the
-- roster because the app has no link from a user to an organization. SET NULL
-- rather than CASCADE: the RFI outlives the unit, and is drawn as "unit removed".
-- created_by is the display name, as on every table here, and is not an
-- identity: created_by_id is the local user id, the only thing resolving checks.
CREATE TABLE operation_rfis (
    id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    operation_id   TEXT         NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    participant_id TEXT         NULL REFERENCES operation_participants(id) ON DELETE SET NULL,
    question       TEXT         NOT NULL,
    status         VARCHAR(16)  NOT NULL DEFAULT 'open',
    created_by     TEXT         NOT NULL DEFAULT '',
    created_by_id  TEXT         NOT NULL DEFAULT '',
    resolved_by    TEXT         NOT NULL DEFAULT '',
    resolved_at    TIMESTAMPTZ  NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT operation_rfis_status_check CHECK (status IN ('open', 'resolved'))
);

CREATE INDEX operation_rfis_operation_id_idx ON operation_rfis (operation_id);
CREATE INDEX operation_rfis_participant_id_idx ON operation_rfis (participant_id);

-- A flat list of replies under an RFI, oldest first.
CREATE TABLE operation_rfi_comments (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    rfi_id        TEXT        NOT NULL REFERENCES operation_rfis(id) ON DELETE CASCADE,
    body          TEXT        NOT NULL,
    created_by    TEXT        NOT NULL DEFAULT '',
    created_by_id TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX operation_rfi_comments_rfi_id_idx ON operation_rfi_comments (rfi_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS operation_rfi_comments;
DROP TABLE IF EXISTS operation_rfis;
-- +goose StatementEnd
