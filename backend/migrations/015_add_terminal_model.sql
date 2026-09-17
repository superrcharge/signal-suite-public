-- +goose Up
ALTER TABLE terminals ADD COLUMN model VARCHAR(50) NULL;

-- +goose Down
ALTER TABLE terminals DROP COLUMN model;
