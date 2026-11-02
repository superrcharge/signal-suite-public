-- +goose Up
-- +goose StatementBegin

-- 'uav' joins the closed platform type list from 045: aircraft, uav, ship,
-- ground vehicle, ground station.
--
-- A UAV is an aircraft nobody talks to from inside it. Declaring one as an
-- aircraft, which is what the wizard had to do while the list had no value for
-- it, puts an unmanned airframe beside a crewed one on an operation's matrix
-- with nothing to tell them apart, and which rows can be talked to from on
-- board is exactly what that matrix is read for. The CHECK is the same list
-- the domain layer's Types holds, so it is dropped and re-added rather than
-- altered in place.

ALTER TABLE platforms DROP CONSTRAINT IF EXISTS platforms_type_check;
ALTER TABLE platforms ADD CONSTRAINT platforms_type_check
    CHECK (type IN ('aircraft', 'uav', 'ship', 'ground vehicle', 'ground station'));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Restores the four-value CHECK from 045. This fails while any row has
-- type = 'uav': nothing recorded whether such a row was an aircraft before,
-- so no remap is attempted. Change or delete those rows first.
ALTER TABLE platforms DROP CONSTRAINT IF EXISTS platforms_type_check;
ALTER TABLE platforms ADD CONSTRAINT platforms_type_check
    CHECK (type IN ('aircraft', 'ship', 'ground vehicle', 'ground station'));

-- +goose StatementEnd
