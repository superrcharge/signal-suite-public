-- +goose Up
CREATE TABLE contracts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             VARCHAR(200) NOT NULL,
  company           VARCHAR(200) NOT NULL,
  poc_name          VARCHAR(100),
  poc_email         VARCHAR(200),
  poc_phone         VARCHAR(50),
  pop_start         DATE,
  pop_end           DATE,
  execution_quarter VARCHAR(2)  CHECK (execution_quarter IN ('Q1','Q2','Q3','Q4')),
  fiscal_year       VARCHAR(4)  NOT NULL,
  notes             VARCHAR(250) NOT NULL DEFAULT '',
  updated_by        VARCHAR(200) NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX contracts_fiscal_year_idx ON contracts (fiscal_year);
CREATE INDEX contracts_pop_end_idx     ON contracts (pop_end) WHERE pop_end IS NOT NULL;

-- +goose Down
DELETE FROM contracts WHERE updated_by = 'system';
DROP INDEX IF EXISTS contracts_pop_end_idx;
DROP INDEX IF EXISTS contracts_fiscal_year_idx;
DROP TABLE IF EXISTS contracts;
