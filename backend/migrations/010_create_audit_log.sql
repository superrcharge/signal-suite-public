-- +goose Up
-- +goose StatementBegin

-- Audit log of every mutation that passes through the app.
-- Deliberately NOT using foreign keys to users or terminals/sections:
-- if a target resource is later deleted, the audit row should remain
-- readable as a historical record. Actor identity is snapshotted by
-- value (name/email) at write time for the same reason - a later
-- rename of a user shouldn't retroactively relabel past events.

CREATE TABLE audit_log (
    id            UUID PRIMARY KEY,
    actor_id      UUID,
    actor_name    VARCHAR(255),
    actor_email   VARCHAR(255),
    resource_type VARCHAR(50)  NOT NULL,
    resource_id   VARCHAR(255) NOT NULL,
    resource_name VARCHAR(255),
    action        VARCHAR(50)  NOT NULL,
    changes       JSONB,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Lookups by specific resource (e.g. "show me the history of ASQD MINI 1")
CREATE INDEX idx_audit_log_resource ON audit_log (resource_type, resource_id);

-- Lookups by actor (e.g. "show me everything SGT Example did")
CREATE INDEX idx_audit_log_actor ON audit_log (actor_id);

-- Chronological scan is the default view; DESC because the UI pages
-- from newest to oldest.
CREATE INDEX idx_audit_log_created_desc ON audit_log (created_at DESC);

-- Filter-by-action queries; low cardinality so a btree is fine.
CREATE INDEX idx_audit_log_action ON audit_log (action);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_audit_log_action;
DROP INDEX IF EXISTS idx_audit_log_created_desc;
DROP INDEX IF EXISTS idx_audit_log_actor;
DROP INDEX IF EXISTS idx_audit_log_resource;
DROP TABLE IF EXISTS audit_log;

-- +goose StatementEnd
