-- +goose Up
-- PoP (point of presence) pin for Starshield terminals (model mini/hp).
-- NULL = not pinned. Values: us-east | us-west | germany | uk | australia.
-- Nullable with no default - NULL is meaningful, unlike pim's ''.
ALTER TABLE terminals ADD COLUMN pop_pin VARCHAR(20);

-- +goose Down
ALTER TABLE terminals DROP COLUMN pop_pin;
