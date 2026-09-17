-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS sections (
    key        VARCHAR(50)  NOT NULL PRIMARY KEY,
    label      VARCHAR(100) NOT NULL,
    color      VARCHAR(20)  NOT NULL
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS sections;
-- +goose StatementEnd
