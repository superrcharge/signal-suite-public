import type { ReactNode } from 'react';
import { Box, Paper, Typography } from '@mui/material';

import { ChannelWheel } from '@/components/pace/ChannelWheel';
import { EquipmentPhoto } from '@/components/catalog/EquipmentPhoto';
import {
  PACE_RADIO_LABELS,
  type PaceCard,
  type PaceFreqRow,
  type PaceTmnRow,
  type PaceTier,
  type PaceRadio,
} from '@/types';
import { PACE_TIERS, SHEET_CHANGED, isMarked } from '@/components/pace/pace-constants';
import { usePaceEmblem } from '@/components/pace/use-pace-emblem';
import { sheetRootProps } from '@/components/common/sheet-export';
import '@/styles/catalog-tokens.css';

// The squadron's comms card, read from the API.
//
// The sheet is drawn at its true output size: US Letter landscape at 96dpi,
// 1056x816. Reviewing the wheels in a responsive column would flatter a layout
// that has to survive a fixed landscape page.
export const PAGE_W = 1056;
export const PAGE_H = 816;

// How far each wheel is pushed toward its own edge of the sheet, widening the
// channel between them without shrinking either one.
//
// Capped by measurement, not by feel. The widest label on a real card renders
// about 98 viewBox units at the current frequency size, leaving 24 units of
// slack beside it, which at the 526px cell is 21.8px. The Paper clips, so a
// spread past that does not move the outermost frequencies, it cuts them off
// the page. 20 leaves under 2px in hand.
//
// This number is downstream of the frequency font size. Enlarging that text
// widens every label and eats this margin directly, so the two move together
// and neither can be changed without re-measuring the other. The measurement is
// also of today's net names; a name much longer than fifteen characters eats it
// too.
const WHEEL_SPREAD = 20;

// Catalog tokens, matching DataSheet.tsx: Oswald for display type, Barlow
// Condensed for dense labels.
const DISPLAY_FONT = 'var(--font-display)';
const CONDENSED_FONT = 'var(--font-condensed)';

/** Maps a saved plan onto the wheel's props. */
function wheelPropsFor(card: PaceCard | undefined, radio: PaceRadio) {
  const plan = card?.plans.find((p) => p.radio_type === radio);
  return {
    channelCount: plan?.channel_count ?? 16,
    // The API resolves override precedence, so this is a straight mapping.
    assignments: (plan?.channels ?? []).map((ch) => ({
      channel: ch.channel_number,
      netName: ch.label_override || ch.net.name,
      // ChannelWheel renders this in the Channel # column of its hidden table,
      // which is the real content for a screen reader. Without it that column
      // was blank for every channel on every card.
      netId: ch.net.net_id,
      roip: ch.net.roip ?? false,
      txFreq: ch.tx_freq,
      rxFreq: ch.rx_freq,
      freqUnit: ch.freq_unit,
      highlights: ch.highlights,
    })),
    // An empty caption renders none at all, so a squadron that does not want
    // one is not given a default it has to remove.
    caption: plan?.label ?? '',
    captionMarked: isMarked(plan?.highlights, 'label'),
  };
}

/**
 * The style a value marked as changed takes: red, and nothing else. Colour
 * only, so a marked value keeps its exact size and weight and the sheet's
 * fixed geometry cannot move.
 *
 * Every marked element also carries `data-changed`, which is what a test or a
 * later "changes only" view can select on without re-reading the payload.
 */
const changedSty = { color: SHEET_CHANGED } as const;

/** Props for any element that may print as changed. */
function changedProps(marked: boolean) {
  return marked ? { 'data-changed': 'true' } : {};
}

/**
 * `2026-08-20` -> `20 AUG 2026`. Deliberately not `08/09/26`, which reads as
 * two different dates depending on who is holding the card.
 */
function formatCardDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const name = months[Number(m) - 1];
  return name ? `${d} ${name} ${y}` : iso;
}

/** The subtext under the title: the date and the version label. */
const dateLineSty = {
  fontFamily: CONDENSED_FONT,
  textAlign: 'center',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'var(--fg-3)',
} as const;

// The middle band's geometry. Every row is a fixed height so the LTAC and
// TACSAT tables stay aligned with each other line for line, whatever either
// one holds.
const BAND_ROW_H = 18;
const FREQ_COLUMNS = ['NAME', 'UP', 'DOWN', 'SAT', 'CRYPTO'];
// NAME takes the slack; the four frequency columns are equal.
const FREQ_GRID = '1.4fr 1fr 1fr 0.7fr 1fr';

// TACSAT also prints the channel a frequency sits on, between the name and the
// uplink. LTAC does not, so the two tables no longer share one column set.
// CH is narrow: it holds "12" or "1-16", not a name.
const TACSAT_COLUMNS = ['NAME', 'CH', 'UP', 'DOWN', 'SAT', 'CRYPTO'];
const TACSAT_GRID = '1.4fr 0.5fr 1fr 1fr 0.7fr 1fr';

// The row fields behind each column set, in the same order. They double as the
// changed-mark names, which is why a cell can look its own mark up by key.
const FREQ_KEYS = ['name', 'up', 'down', 'sat', 'crypto'] as const;
const TACSAT_KEYS = ['name', 'channel', 'up', 'down', 'sat', 'crypto'] as const;

// 13.5 rather than 12.5: BAND_ROW_H pins both the line height and the row
// height, so a larger cell font changes nothing structural -- the tables had a
// pixel of legibility going spare and were spending it on nothing. Cells are
// nowrap + ellipsis, so the only cost is that a long value truncates fractionally
// sooner.
const bandCellSty = {
  fontFamily: CONDENSED_FONT,
  fontSize: 13.5,
  fontWeight: 700,
  lineHeight: `${BAND_ROW_H}px`,
  height: BAND_ROW_H,
  px: 0.5,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
} as const;

/** One value cell of the band, red when marked as changed. */
function BandCell({ marked, children }: { marked: boolean; children: ReactNode }) {
  return (
    <Typography {...changedProps(marked)} sx={marked ? { ...bandCellSty, ...changedSty } : bandCellSty}>
      {children}
    </Typography>
  );
}

/** One frequency table: LTAC or TACSAT.
 *
 *  withChannel drives both the heading row and the cells, so the two cannot
 *  drift apart into a table whose columns do not match its headings. */
function FreqTable({
  title,
  rows,
  withChannel = false,
}: {
  title: string;
  rows: PaceFreqRow[];
  withChannel?: boolean;
}) {
  const columns = withChannel ? TACSAT_COLUMNS : FREQ_COLUMNS;
  const grid = withChannel ? TACSAT_GRID : FREQ_GRID;
  return (
    <Box>
      <Typography
        sx={{
          fontFamily: DISPLAY_FONT,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {title}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: grid }}>
        {columns.map((col) => (
          <Typography
            key={col}
            sx={{
              ...bandCellSty,
              fontWeight: 700,
              letterSpacing: '0.06em',
              borderBottom: '1px solid var(--fg-1)',
              color: 'var(--fg-2)',
            }}
          >
            {col}
          </Typography>
        ))}
        {/* A block with nothing typed keeps its heading row and stops there,
            so the sheet holds its structure when only one table is filled. */}
        {rows.map((row, i) => (
          <Box key={i} sx={{ display: 'contents' }}>
            {(withChannel ? TACSAT_KEYS : FREQ_KEYS).map((key) => (
              <BandCell key={key} marked={isMarked(row.highlights, key)}>
                {row[key]}
              </BandCell>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// Two columns, no column names. TACTICAL MISSION NETWORK rows are a label and its value,
// and the label column already says what each line is, so a heading over it
// would only repeat the row beneath it. LTAC and TACSAT name their columns
// because a bare frequency does not say whether it is an uplink or a downlink.
const TMN_COLUMN_COUNT = 2;
const TMN_GRID = '1.2fr 1fr';

/** TACTICAL MISSION NETWORK: a label and its value per line.
 *
 *  Structurally identical to FreqTable rather than a bordered box. It used to
 *  carry its own border and vertical padding, which pushed its interior down by
 *  the border plus the padding, so its heading and its rule sat lower than the
 *  two tables beside it. Three blocks on one line reading as one band is worth
 *  more than the box was. */
function TmnBox({ rows }: { rows: PaceTmnRow[] }) {
  return (
    <Box>
      <Typography
        sx={{
          fontFamily: DISPLAY_FONT,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        TACTICAL MISSION NETWORK
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: TMN_GRID }}>
        {/* An empty heading row, kept on purpose. It carries the rule and the
            row of height that puts this block's line on the same baseline as
            LTAC's and TACSAT's; dropping the row would pull the whole table up
            and leave the three headings out of step again. Only the words go. */}
        {Array.from({ length: TMN_COLUMN_COUNT }, (_, i) => (
          <Typography
            key={i}
            aria-hidden
            sx={{
              ...bandCellSty,
              borderBottom: '1px solid var(--fg-1)',
            }}
          />
        ))}
        {rows.map((row, i) => (
          <Box key={i} sx={{ display: 'contents' }}>
            <BandCell marked={isMarked(row.highlights, 'label')}>{row.label}</BandCell>
            <BandCell marked={isMarked(row.highlights, 'value')}>{row.value}</BandCell>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** One PACE tile.
 *
 *  Exported for the editor's live preview, which lays these out in a column
 *  beside the wheels. Sharing the component is what stops the editor growing a
 *  second tile that drifts from what actually prints.
 *
 *  The tile height is fixed at the value the dashed placeholder used, so a card
 *  with four configured tiers is exactly as tall as one with none and the sheet
 *  stays on a single page either way.
 *
 *  A tier with source `none` renders exactly what the placeholder always did:
 *  the letter, the label, a dashed border. That is the empty state, not a
 *  missing one, so a squadron that has configured nothing sees no change. */
export function PaceTile({ letter, label, tier }: { letter: string; label: string; tier?: PaceTier }) {
  const source = tier?.source ?? 'none';
  const isSet = source !== 'none';

  // Selects the two-column layout below. Only ever true when `isSet` is.
  const hasPhoto =
    source === 'equipment' && Boolean(tier?.equipment_id) && Boolean(tier?.equipment_photo_url);

  // The catalog nickname is what an equipment tile is titled with, because the
  // people reading a printed card know their terminals by it. `||` and not
  // `??`: the field is projected as an empty string for a record that recorded
  // no nickname, so `??` would title the tile blank rather than fall back.
  const title =
    source === 'equipment' ? (tier?.equipment_nickname || tier?.equipment_nomenclature)
      : source === 'transport' ? tier?.transport_name
        : source === 'custom' ? tier?.custom_label
          : '';

  const marks = tier?.highlights;
  const nameMarked = isMarked(marks, 'name');
  const serviceMarked = isMarked(marks, 'service');
  const detailMarked = isMarked(marks, 'detail');

  const body = (
    <>
      <Typography
        {...changedProps(nameMarked)}
        sx={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 600,
          fontSize: 13,
          lineHeight: 1.15,
          textAlign: hasPhoto ? 'left' : 'center',
          letterSpacing: '0.04em',
          ...(nameMarked ? changedSty : null),
        }}
      >
        {title}
      </Typography>
      {/* The capability's abbreviation -- "GX", not "Inmarsat Global Express".
          It is what the operators reading the card call it, and it is the one
          form that fits a tile this size without a wrap.

          The spelled-out name has not gone anywhere: the editor's capability
          picker renders "GX - Inmarsat Global Express", so the editor is where
          the acronym is learned and the card is where it is read.

          Clamped to two lines anyway. `service_abbrev` is validated at 40
          characters, which can still exceed one line at this size, and the tile
          below is a fixed 186px with overflow: hidden on a print route that
          does not scale -- so without a clamp an over-long abbreviation would
          push CIR/MIR and the detail line out of the box silently rather than
          visibly. */}
      {source === 'equipment' && tier?.service_abbrev && (
        <Typography
          {...changedProps(serviceMarked)}
          sx={{
            fontFamily: CONDENSED_FONT,
            fontSize: 11.5,
            fontWeight: 700,
            color: serviceMarked ? SHEET_CHANGED : 'var(--fg-2)',
            lineHeight: 1.2,
            textAlign: hasPhoto ? 'left' : 'center',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {tier.service_abbrev}
        </Typography>
      )}
      {/* Rates arrive already formatted and are empty when the equipment
          record carries no matching service, so an absent rate prints as
          nothing rather than as a zero. */}
      {tier?.service_cir && (
        <Typography sx={{ fontFamily: CONDENSED_FONT, fontSize: 10.5, color: 'var(--fg-2)' }}>
          CIR {tier.service_cir}
        </Typography>
      )}
      {tier?.service_mir && (
        <Typography sx={{ fontFamily: CONDENSED_FONT, fontSize: 10.5, color: 'var(--fg-2)' }}>
          MIR {tier.service_mir}
        </Typography>
      )}
      {tier?.detail && (
        <Typography
          {...changedProps(detailMarked)}
          sx={{
            fontFamily: CONDENSED_FONT,
            fontSize: 10.5,
            color: detailMarked ? SHEET_CHANGED : 'var(--fg-3)',
            textAlign: hasPhoto ? 'left' : 'center',
            lineHeight: 1.2,
          }}
        >
          {tier.detail}
        </Typography>
      )}
    </>
  );

  // A Box, never a fragment: the tile is a cell of a repeat(4, 1fr) grid, so a
  // fragment would return two grid children per tier and lay eight cells out
  // over two rows.
  return (
    <Box>
      {/* Outside the tile, so it no longer inherits the tile's alignItems and
          needs its own textAlign. Spells the tier out once a source is set, and
          the grey subtext inside only ever shows on an empty tile, so no tile
          prints the same word twice. */}
      <Typography
        sx={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 600,
          fontSize: 22,
          color: 'var(--shf-amber)',
          textAlign: 'center',
        }}
      >
        {isSet ? label : letter}
      </Typography>

      <Box
        sx={{
          // Shrunk from 210. The tables band above takes whatever the tiles give
          // up, so every pixel here is a row a squadron can type into. Held at a
          // value that still fits a photo, a name, a service, both rates and a
          // detail line without clipping.
          height: 186,
          border: isSet ? '1px solid var(--fg-1)' : '1px dashed var(--border-soft)',
          borderRadius: 1,
          // A terminal photo usually carries a white backdrop, and the sheet is
          // tan, so without this the picture sits inside a visible tan band
          // inside a black border.
          background: 'var(--shf-white)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          // Centred whatever the tile holds. A set tile used to pin its content
          // to the top, so a terminal's photo, name, service, rates and detail
          // sat in the upper part of a 186px box with dead space under them,
          // while an empty tile centred its placeholder. The block is shorter
          // than the tile in every case, so there is always slack to split, and
          // splitting it is what makes the four tiles read as a row.
          justifyContent: 'center',
          gap: 0.5,
          px: 0.75,
          py: isSet ? 0.75 : 0,
          overflow: 'hidden',
        }}
      >
        {!isSet && (
          <Typography variant="caption" sx={{ fontFamily: CONDENSED_FONT, color: 'var(--fg-3)' }}>
            {label}
          </Typography>
        )}

        {isSet &&
          (hasPhoto ? (
            <Box
              sx={{
                display: 'flex',
                // Centred, not flex-start: the photo is a fixed 78px tall and
                // the text column beside it is usually taller, so top-aligning
                // hung the picture off the top of a block it should sit level
                // with. The photo stays left-justified within its own 40%.
                alignItems: 'center',
                gap: 0.75,
                width: '100%',
                minWidth: 0,
              }}
            >
              {/* Read back through the API, never from the stored URL.
                  equipment.photo_url holds a raw Azure blob URL and the container is
                  created with allowBlobPublicAccess false, so a browser fetching it
                  directly is refused and draws its broken-image glyph. That is the
                  bug the squadron emblem had in an earlier release, and this tile was the last
                  place in the frontend still doing it. EquipmentPhoto takes the id
                  and uses photoUrl only to invalidate its cache.

                  Kept as the original inline guard rather than reusing hasPhoto, so
                  TypeScript still narrows equipment_id and equipment_photo_url and no
                  non-null assertion is needed. */}
              {source === 'equipment' && tier?.equipment_id && tier?.equipment_photo_url && (
                <EquipmentPhoto
                  equipmentId={tier.equipment_id}
                  photoUrl={tier.equipment_photo_url}
                  // objectPosition is what actually left-aligns the picture inside
                  // its box; objectFit: contain alone centres it.
                  style={{
                    width: '40%',
                    height: 78,
                    objectFit: 'contain',
                    objectPosition: 'left center',
                    flexShrink: 0,
                  }}
                />
              )}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.5,
                  minWidth: 0,
                  flex: '1 1 auto',
                }}
              >
                {body}
              </Box>
            </Box>
          ) : (
            body
          ))}
      </Box>
    </Box>
  );
}

export function SheetPreview({ card, sectionLabel }: { card?: PaceCard; sectionLabel: string }) {
  // Read through the API rather than from the stored blob URL, which the
  // browser is not allowed to fetch. Falls back to the generated placeholder,
  // so a hub is never left empty and never shows a broken image.
  const { emblemHref: emblemUrl } = usePaceEmblem(card?.section, card?.emblem_url, sectionLabel);
  const titleMarked = isMarked(card?.highlights, 'title');
  const dateMarked = isMarked(card?.highlights, 'date');
  const versionMarked = isMarked(card?.highlights, 'version');
  const date = card?.effective_date ? formatCardDate(card.effective_date) : '';
  const version = card?.version ?? '';
  return (
    // Centred in whatever space the pane has, rather than pinned to the
    // sidebar. The sheet is a fixed 1056px, so when the pane is narrower the
    // container scrolls instead of squashing it.
    // pace-print-wrapper is targeted by a print-only block in
    // catalog-tokens.css. The pb: 2 below is 16px outside an 816px Paper on
    // an 816px page, which is the entire blank second page - but it is wanted
    // on screen, and this component is shared with pace-section-page.
    <Box className="pace-print-wrapper" sx={{ display: 'flex', justifyContent: 'center', overflow: 'auto', pb: 2 }}>
        <Paper
          elevation={3}
          // The sheet exporter's handle. This Paper, not the wrapper around it,
          // is the printed page: its untransformed box is exactly PAGE_W x
          // PAGE_H. A data attribute rather than an id because ids must be
          // unique and the exporter needs one selector for both sheets.
          {...sheetRootProps()}
          sx={{
            width: PAGE_W,
            height: PAGE_H,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            // The sheet lives on paper, exactly like the catalog datasheet
            // (DataSheet.tsx). It is a printed product -- rendering it on the
            // dark app surface would both look like a different product and
            // dump toner.
            background: 'var(--shf-paper)',
            color: 'var(--fg-1)',
            // Deliberately tight: the sheet is an information-density product,
            // so page margins are given over to the wheels and the PACE band.
            px: 0.25,
            py: 0.5,
            overflow: 'hidden',
          }}
        >
          {/* Centred card title -- names the exercise/operation this card covers.
              Becomes an editable field on the plan; sample text here. */}
          <Typography
            {...changedProps(titleMarked)}
            sx={{
              fontFamily: DISPLAY_FONT,
              textAlign: 'center',
              fontWeight: 600,
              fontSize: 30,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              lineHeight: 1.1,
              ...(titleMarked ? changedSty : null),
            }}
          >
            {card?.title || 'Untitled card'}
          </Typography>
          {/* The date and the version are siblings in a flex row, never spans
              in one line of text. The slide export emits each laid-out element
              as one text box in that element's colour, so a red version inside
              a grey date line would have exported grey. As flex items each is
              its own run, in its own colour. */}
          {date || version ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.75, mt: 0.25 }}>
              {date && (
                <Typography
                  {...changedProps(dateMarked)}
                  sx={{ ...dateLineSty, ...(dateMarked ? changedSty : null) }}
                >
                  {date}
                </Typography>
              )}
              {date && version && <Typography sx={dateLineSty}>·</Typography>}
              {version && (
                <Typography
                  {...changedProps(versionMarked)}
                  // Printed as typed: "v2" is not "V2" to the people who
                  // number their revisions that way.
                  sx={{ ...dateLineSty, textTransform: 'none', ...(versionMarked ? changedSty : null) }}
                >
                  {version}
                </Typography>
              )}
            </Box>
          ) : null}

          {/* Width is the contested axis: two wheels side by side get about
              512px each and the labels want all of it. Height is not, so the
              wheel's viewBox is taller than it is wide and the row is given
              every pixel the bands below do not need. `alignItems: start` keeps
              the wheels tight under the title rather than floating them in the
              middle of whatever slack is left. */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 0,
              alignItems: 'start',
              flex: '0 0 auto',
              minHeight: 0,
              mt: 0,
            }}
          >
            {/* Each wheel is nudged toward its own edge of the sheet, which
                widens the channel between them without shrinking either one.
                WHEEL_SPREAD is capped by the slack inside the SVG: the label
                column reaches within ~17 viewBox units of the frame, and the
                Paper clips, so a larger shift would cut the outermost
                frequencies off the page rather than move them. */}
            <Box sx={{ transform: `translateX(-${WHEEL_SPREAD}px)` }}>
              <ChannelWheel
                title={`${PACE_RADIO_LABELS.jem} channel wheel`}
                emblemUrl={emblemUrl}
                {...wheelPropsFor(card, 'jem')}
              />
            </Box>
            <Box sx={{ transform: `translateX(${WHEEL_SPREAD}px)` }}>
              <ChannelWheel
                title={`${PACE_RADIO_LABELS.mpu5} channel wheel`}
                emblemUrl={emblemUrl}
                {...wheelPropsFor(card, 'mpu5')}
              />
            </Box>
          </Box>

          {/* The middle band: LTAC, TACSAT and TACTICAL MISSION NETWORK as three columns of
              one grid, so all three share a row baseline and their heading
              rules line up. They were previously nested two-deep, which let the
              third block drift against the other two.

              This band takes the slack now (`1 1 auto`) and the wheels row above
              it is `0 0 auto`. The wheels are a fixed drawing and gain nothing
              from extra height, whereas an empty table band that grows downward
              is what lets a filling table extend toward the PACE tiles instead
              of the whole band floating just above them. `alignContent: start`
              is what pins the content to the top of that space rather than
              centring it in the leftover.

              The three bands still sit flush: no gap, border, or margin between
              them. */}
          <Box
            sx={{
              flex: '1 1 auto',
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: '3.5fr 3.5fr 3fr',
              alignContent: 'start',
              alignItems: 'start',
              gap: 1.5,
              px: 1.5,
            }}
          >
            <FreqTable title="LTAC" rows={card?.ltac_rows ?? []} />
            <FreqTable title="TACSAT" rows={card?.tacsat_rows ?? []} withChannel />
            <TmnBox rows={card?.tmn_rows ?? []} />
          </Box>

          {/* PACE band. Each tile renders whatever its tier points at: a catalog
              terminal with its photo and service rates, a Transport Library
              entry, a typed line, or nothing yet. Every field is read straight
              off the payload; nothing is resolved here, so the print route
              needs no second request. */}
          <Box sx={{ flex: '0 0 auto' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
              {PACE_TIERS.map((tier) => (
                <PaceTile
                  key={tier.key}
                  letter={tier.key}
                  label={tier.label}
                  tier={card?.tiers?.find((t) => t.tier === tier.key)}
                />
              ))}
            </Box>
          </Box>
        </Paper>
    </Box>
  );
}
