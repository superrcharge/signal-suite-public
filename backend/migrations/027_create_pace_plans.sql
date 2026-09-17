-- +goose Up
-- +goose StatementBegin

-- The card's header: what this squadron's comms card is called, and when it
-- takes effect. One per squadron, alongside its two channel plans.
CREATE TABLE IF NOT EXISTS pace_plans (
    id             UUID         NOT NULL PRIMARY KEY,
    section        VARCHAR(50)  NOT NULL UNIQUE REFERENCES sections(key) ON UPDATE CASCADE,

    -- Centred on the sheet. Names the exercise or operation the card is for.
    title          VARCHAR(200) NOT NULL DEFAULT '',

    -- Nullable, and that nullability IS the flag: no date means no date
    -- subtext. A separate show_date boolean could contradict the column --
    -- true with nothing set, false with a date stored -- and then something
    -- has to arbitrate.
    effective_date DATE         NULL,

    -- Ship unused. The sheet header is the title and the optional date; these
    -- exist so switching either on later is a UI change, not a migration.
    heading        VARCHAR(200) NOT NULL DEFAULT 'Services provided via the following PACE:',
    classification VARCHAR(60)  NOT NULL DEFAULT '',

    notes          VARCHAR(250) NOT NULL DEFAULT '',
    updated_by     VARCHAR(200) NOT NULL DEFAULT '',
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS pace_plans;
-- +goose StatementEnd
