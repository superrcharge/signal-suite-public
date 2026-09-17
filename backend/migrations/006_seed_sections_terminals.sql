-- +goose Up
-- +goose StatementBegin

-- Starter sections, so a fresh database is usable straight away. Rename,
-- recolor or delete them in Settings once your own structure exists.
-- Migration 012 later drops the hyphen from these keys.
INSERT INTO sections (key, label, color) VALUES
  ('a-sqd', 'A SQD', '#388bfd'),
  ('b-sqd', 'B SQD', '#3fb950'),
  ('c-sqd', 'C SQD', '#a371f7'),
  ('d-sqd', 'D SQD', '#f0883e'),
  ('e-sqd', 'E SQD', '#f85149'),
  ('f-sqd', 'F SQD', '#39d3f0');

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM sections WHERE key IN ('a-sqd','b-sqd','c-sqd','d-sqd','e-sqd','f-sqd');
-- +goose StatementEnd
