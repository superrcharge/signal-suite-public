-- +goose Up
ALTER TABLE terminals ADD COLUMN pim VARCHAR(100) NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE terminals DROP COLUMN pim;
