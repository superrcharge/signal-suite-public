-- +goose Up
ALTER TABLE contracts
  ADD COLUMN logform_number VARCHAR(20) NULL,
  ADD COLUMN logform_url    VARCHAR(2000) NULL;

-- +goose Down
ALTER TABLE contracts
  DROP COLUMN logform_number,
  DROP COLUMN logform_url;
