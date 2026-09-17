import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Alert, Box, Button, Typography } from '@mui/material';

import { CONTENT_GUTTER, HEADER_HEIGHT, MainLayout } from '@/components/layouts/main-layout';
import { CONTENT_LINE } from '@/components/common';
import { LoadingSpinner, PageBanner, PageTitle } from '@/components/common';
import { ChannelWheel } from '@/components/pace/ChannelWheel';
import { TIER_SOURCE_OPTIONS, tierGap, tierGapMessage } from '@/components/pace/tier-source';
import { PACE_TIERS, isMarked, toggleMark } from '@/components/pace/pace-constants';
import { PaceTile } from '@/components/pace/SheetPreview';
import { usePaceEmblem } from '@/components/pace/use-pace-emblem';

// Half the sheet's 1056px page, which is the width each wheel is given when it
// prints. The preview matches it so what the editor shows is what comes out.
const WHEEL_PREVIEW_W = 528;

// The PACE tiles' column, beside the wheels rather than beneath them. On the
// printed sheet the four tiles run across the bottom; in a preview pane that is
// half a window wide there is no room for that, and stacking them under two
// wheels puts them below the fold, which is the whole thing the preview exists
// to avoid. Turning the card on its side is the trade: the tiles are visible
// while the wheels are being edited.
const TILE_PREVIEW_W = 210;

/**
 * What the editor's two panes have to give up to the chrome above and below
 * them, so `100vh` minus this is exactly the height left for them.
 *
 * Built from the parts rather than written as one number, because a bare
 * `calc(100vh - 156px)` says nothing about which 156 and goes quietly wrong the
 * next time the banner changes. Measured at 1600x1000: the grid starts at y=132
 * and the window is 1000, so the panes get 844.
 *
 * The top gutter is deliberately absent. `PageBanner` cancels it with its own
 * negative margin so the rail meets the sidebar, which leaves only the bottom
 * one to subtract.
 */
// The banner's height alone. It carries no bottom margin: the form pane's own
// top padding is the gap, and having both stacked 46px of dead space between the
// amber rule and the first section heading.
const PAGE_BANNER_BLOCK = 52;
/**
 * No gutter term, top or bottom. `PageBanner` cancels the top one with its own
 * negative margin, and the grid below now cancels the bottom one with `mb`, so
 * subtracting either here would pay for it twice - the trap the catalog
 * editor's own chrome constant records.
 */
const EDITOR_CHROME_H = HEADER_HEIGHT + PAGE_BANNER_BLOCK;
import { usePaceSections } from '@/components/pace/use-pace-sections';
import {
  EditorFormSection,
  SHFCheckbox,
  SHFMarkToggle,
  SHFSelectField,
  SHFTextField,
} from '@/components/shf-form';
import { inputSty, labelSty, onBlur, onFocus, rowSty } from '@/components/shf-form/styles';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts';
import { ApiClientError } from '@/services/api-client';
import {
  useDeletePaceEmblem,
  useEquipment,
  useEquipmentItem,
  useNets,
  usePaceCard,
  useTransports,
  useSavePaceCard,
  useSections,
  useUploadPaceEmblem,
} from '@/services';
import { transportKindLabel } from '@/types';
import {
  PACE_RADIOS,
  PACE_RADIO_LABELS,
  carriedBy,
  type Equipment,
  type EquipmentService,
  type EquipmentWaveform,
  type PaceCard,
  type PaceTier,
  type PaceTierSource,
  type PaceFreqRow,
  type PaceTmnRow,
  type PaceRadio,
  type SavePaceCardRequest,
  type Transport,
} from '@/types';
import { NotFoundPage } from './not-found-page';
import '@/styles/catalog-tokens.css';

/** One editable channel row. A blank netId means the position is unassigned. */
interface ChannelDraft {
  netId: string;
  txOverride: string;
  rxOverride: string;
  labelOverride: string;
  /** Changed-marks: 'net', 'tx', 'rx'. Every `highlights` in this draft is a
   *  row's own marked fields, sent as-is and printed red on the sheet. */
  highlights: string[];
}

interface PlanDraft {
  label: string;
  /** 'label': the wheel caption. */
  highlights: string[];
  channelCount: number;
  /** Dense: index 0 is channel 1, so every position has a row whether filled or not. */
  channels: ChannelDraft[];
}

// The row caps, matching validation.go. The sheet is a fixed 816px page and the
// band has a fixed share of it, so these are constants on both sides rather
// than anything configurable.
const LTAC_ROWS = 8;
const TACSAT_ROWS = 8;
const TMN_ROWS = 6;

// What a squadron with no TACTICAL MISSION NETWORK rows saved starts with. Seeded labels
// rather than a blank grid, because these three are on every card.
const TMN_SEED = ['DATA SYNC', 'CHAT', 'MEDICAL'];

// One cell of a band row: the field it edits and its column title. The title
// also ends the placeholder ("TACSAT 1 ch"), which is how the tests address it.
type BandCell = { key: 'name' | 'channel' | 'up' | 'down' | 'sat' | 'crypto'; label: string };
const NAME: BandCell = { key: 'name', label: 'name' };
const CH: BandCell = { key: 'channel', label: 'ch' };
const UP: BandCell = { key: 'up', label: 'up' };
const DOWN: BandCell = { key: 'down', label: 'down' };
const SAT: BandCell = { key: 'sat', label: 'sat' };
const CRYPTO: BandCell = { key: 'crypto', label: 'crypto' };

// Each entry is TWO lines of three, not one line of five or six.
//
// Every cell carries a "changed" tick beside it, and six cells plus six ticks
// do not fit a half-pane row at the 1280 floor: CH and SAT went to a few
// pixels. Ticks inset in the box and ticks under each cell were both tried and
// rejected in review. Three to a line gives each box about twice the width.
//
// Line 1 is what a reader looks up - the name and its two frequencies. Line 2
// is the detail. LTAC prints no channel, so its first line-2 cell is empty
// (null) and SAT and CRYPTO keep the same columns in both tables.
const LTAC_LINES: (BandCell | null)[][] = [[NAME, UP, DOWN], [null, SAT, CRYPTO]];
const TACSAT_LINES: (BandCell | null)[][] = [[NAME, UP, DOWN], [CH, SAT, CRYPTO]];
const BAND_GRID_COLS = '1.4fr 1fr 1fr';

// The row-number gutter, the same 16px left-aligned column the channel rows
// use, so all of the form's numbered lists start on the same edge.
const BAND_ROW_COLS = '16px minmax(0, 1fr)';

// Drops a band row's number level with its first box. Each box has a title
// above it (10px mono label plus its 4px margin, about 16px), and the channel
// rows' pt: 1 (8px) is what centres a number on a box with no title.
const BAND_NUMBER_PT = '24px';

interface Draft {
  title: string;
  includeDate: boolean;
  effectiveDate: string;
  /** Free text printed after the date ("v2"). */
  version: string;
  /** 'title', 'date', 'version'. */
  highlights: string[];
  plans: Record<PaceRadio, PlanDraft>;
  // Padded to their full length so the editor always shows a fixed grid to
  // type into. toRequest drops the blanks, so the padding never reaches the
  // server as stored rows.
  ltacRows: PaceFreqRow[];
  tacsatRows: PaceFreqRow[];
  tmnRows: PaceTmnRow[];
  // Always four, in P A C E order, so the editor renders a fixed set of rows
  // and toRequest can send them without padding logic of its own.
  tiers: TierDraft[];
}

interface TierDraft {
  tier: string;
  source: PaceTierSource;
  equipmentId: string;
  transportId: string;
  serviceAbbrev: string;
  customLabel: string;
  detail: string;
  /** 'name', 'service', 'detail'. */
  highlights: string[];
}

// Both derived from the one list in pace-constants, so the editor's rows, the
// sheet's tiles and the preview's tiles cannot disagree about a tier's spelling.
const TIER_LETTERS = PACE_TIERS.map((t) => t.key);
const TIER_LABELS: Record<string, string> = Object.fromEntries(
  PACE_TIERS.map((t) => [t.key, t.label]),
);

/** Pads the stored tiers out to all four letters, so a squadron with none still
 *  gets four rows to fill in. The server pads on read too, but the editor must
 *  not depend on that: a card fetched before this feature shipped has none. */
function tierDraftsFrom(card: PaceCard | undefined): TierDraft[] {
  return TIER_LETTERS.map((letter) => {
    const stored = card?.tiers?.find((t) => t.tier === letter);
    return {
      tier: letter,
      source: stored?.source ?? 'none',
      equipmentId: stored?.equipment_id ?? '',
      transportId: stored?.transport_id ?? '',
      serviceAbbrev: stored?.service_abbrev ?? '',
      customLabel: stored?.custom_label ?? '',
      detail: stored?.detail ?? '',
      highlights: stored?.highlights ?? [],
    };
  });
}

/**
 * Renders a rate pair the way the sheet prints it: "dl/ul Mbps", a dash for a
 * missing half, and nothing at all when both are absent.
 *
 * Has to agree with `formatRate` in `backend/internal/domain/pace/repository.go`,
 * which is what produces `service_cir` / `service_mir` on a saved card. This one
 * exists only because the live preview draws from an unsaved draft and so cannot
 * ask the server.
 */
function formatTierRate(dl?: number, ul?: number): string {
  if (dl == null && ul == null) return '';
  return `${dl ?? '-'}/${ul ?? '-'} Mbps`;
}

/** A capability is whatever a tier's abbreviation can name: a SATCOM service or
 *  a radio's waveform. The two are the same record minus the rates, and both are
 *  denormalized onto the equipment row under their own key, so the only thing
 *  needed to treat them alike is to look in both places.
 *
 *  Services first, so the capability picker lists a terminal's services above
 *  its waveforms and an abbreviation present in both resolves to the service.
 *  Only the picker reads this; the rates lookup below reads `services` alone,
 *  the same array the SQL's LATERAL reads. */
function capabilitiesOf(eq?: Equipment): Array<EquipmentService | EquipmentWaveform> {
  return [...(eq?.data?.services ?? []), ...(eq?.data?.waveforms ?? [])];
}

/**
 * Resolves a draft tier into the shape the printed tile takes.
 *
 * `PaceTier`'s display fields -- nomenclature, nickname, photo, transport name,
 * the two rates -- are resolved server-side in `loadTiers`, so a draft that has
 * not been saved carries only ids. The preview resolves the same fields off the
 * lists the editor already has open, which is what lets a tile update as a
 * terminal or a service is picked rather than only after a save.
 *
 * The rates come from the selected terminal's OWN services array, matched by
 * abbreviation, not from the global Services Library: two terminals on the same
 * service carry different committed rates. Same rule as the SQL, and the same
 * array -- only a service carries rates, so a radio's waveform resolves to none
 * here exactly as it does on the server.
 *
 * The nickname is passed through raw and the fallback to the nomenclature lives
 * in `PaceTile`, so the preview and the printed sheet cannot disagree about
 * which one a tile is titled with.
 */
function tierPreviewFrom(
  draft: TierDraft | undefined,
  equipment: Equipment[],
  transports: Transport[],
): PaceTier | undefined {
  if (!draft) return undefined;

  const eq = draft.source === 'equipment'
    ? equipment.find((e) => e.id === draft.equipmentId)
    : undefined;
  const tr = draft.source === 'transport'
    ? transports.find((t) => t.id === draft.transportId)
    : undefined;
  // Rates are looked up in `services` alone, because only a service has them.
  // The SQL's LATERAL reads the same array, so a waveform abbreviation resolves
  // to no rates in both places rather than to different ones.
  const rates = draft.serviceAbbrev
    ? eq?.data?.services?.find(
        (x) => x.abbrev.toLowerCase() === draft.serviceAbbrev.toLowerCase(),
      )
    : undefined;

  return {
    tier: draft.tier,
    source: draft.source,
    equipment_id: draft.equipmentId,
    transport_id: draft.transportId,
    service_abbrev: draft.serviceAbbrev,
    custom_label: draft.customLabel,
    detail: draft.detail,
    highlights: draft.highlights,
    equipment_nomenclature: eq?.nomenclature ?? '',
    equipment_nickname: eq?.nickname ?? '',
    equipment_photo_url: eq?.photo_url ?? '',
    transport_name: tr?.name ?? '',
    service_cir: formatTierRate(rates?.cir?.dl, rates?.cir?.ul),
    service_mir: formatTierRate(rates?.mir?.dl, rates?.mir?.ul),
  };
}

const emptyFreqRow = (): PaceFreqRow => ({ name: '', channel: '', up: '', down: '', sat: '', crypto: '', highlights: [] });

/** Pads a stored list out to the grid the editor renders. */
function padFreqRows(rows: PaceFreqRow[] | undefined, count: number): PaceFreqRow[] {
  return Array.from({ length: count }, (_, i) => rows?.[i] ?? emptyFreqRow());
}

function padTmnRows(rows: PaceTmnRow[] | undefined): PaceTmnRow[] {
  return Array.from({ length: TMN_ROWS }, (_, i) => {
    const stored = rows?.[i];
    if (stored) return stored;
    // Only a card with nothing stored gets the seed: once a squadron has saved
    // a band, its own labels are the truth, blanks included.
    const label = rows?.length ? '' : (TMN_SEED[i] ?? '');
    return { label, value: '', highlights: [] };
  });
}

const isBlankFreqRow = (r: PaceFreqRow) =>
  ![r.name, r.channel, r.up, r.down, r.sat, r.crypto].some((v) => v.trim() !== '');

const trimFreqRow = (r: PaceFreqRow): PaceFreqRow => ({
  name: r.name.trim(),
  channel: r.channel.trim(),
  up: r.up.trim(),
  down: r.down.trim(),
  sat: r.sat.trim(),
  crypto: r.crypto.trim(),
  highlights: r.highlights ?? [],
});

const emptyChannel = (): ChannelDraft => ({
  netId: '',
  txOverride: '',
  rxOverride: '',
  labelOverride: '',
  highlights: [],
});

function planDraftFrom(card: PaceCard | undefined, radio: PaceRadio): PlanDraft {
  const plan = card?.plans.find((p) => p.radio_type === radio);
  const count = plan?.channel_count ?? 16;
  const channels = Array.from({ length: count }, emptyChannel);

  for (const ch of plan?.channels ?? []) {
    const idx = ch.channel_number - 1;
    if (idx < 0 || idx >= count) continue;
    channels[idx] = {
      netId: ch.net.id,
      // The API returns the resolved value; only a genuine override is echoed
      // back into the form, so an untouched row does not silently become one.
      txOverride: ch.is_overridden ? ch.tx_freq : '',
      rxOverride: ch.is_overridden ? ch.rx_freq : '',
      labelOverride: ch.label_override,
      highlights: ch.highlights ?? [],
    };
  }
  return { label: plan?.label ?? '', highlights: plan?.highlights ?? [], channelCount: count, channels };
}

/** One tier's row in Section 06.
 *
 *  Changing the source clears the fields belonging to the previous one here in
 *  the draft, as well as in toRequest. Clearing in one place only would leave
 *  the editor showing a terminal it is no longer going to send. */
function TierRow({ tier, onChange }: { tier: TierDraft; onChange: (next: TierDraft) => void }) {
  const { data: equipmentList } = useEquipment();
  const { data: transportList } = useTransports();
  // The services carrying CIR and MIR live on the equipment record itself, not
  // on the global Services Library, so the selected terminal is fetched to read
  // its own services array.
  const { data: equipment } = useEquipmentItem(tier.source === 'equipment' ? tier.equipmentId : '');

  // A radio's capabilities are waveforms, not services, and the tier stores one
  // abbreviation either way. Reading only `services` here is what left a radio
  // with a dropdown that was enabled and empty.
  const isRadio = equipment?.terminal_type === 'radio';
  const capabilities = capabilitiesOf(equipment);

  // One gap per tier: a tier has exactly one reference field for its source.
  const gap = tierGap(tier);
  const gapText = gap ? tierGapMessage(gap) : undefined;

  // The changed tick for one of the tile's printed values. 'name' is the tile
  // title, so it rides on whichever field supplies it for the current source.
  const mark = (key: string, name: string) => ({
    marked: isMarked(tier.highlights, key),
    onMark: (on: boolean) => onChange({ ...tier, highlights: toggleMark(tier.highlights, key, on) }),
    markName: `${TIER_LABELS[tier.tier] ?? tier.tier} ${name}`,
  });

  const setSource = (source: PaceTierSource) =>
    onChange({
      ...tier,
      source,
      equipmentId: source === 'equipment' ? tier.equipmentId : '',
      serviceAbbrev: source === 'equipment' ? tier.serviceAbbrev : '',
      transportId: source === 'transport' ? tier.transportId : '',
      customLabel: source === 'custom' ? tier.customLabel : '',
    });

  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        sx={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.12em',
          color: 'var(--shf-amber)',
          mb: 0.5,
        }}
      >
        {tier.tier} - {TIER_LABELS[tier.tier]}
      </Typography>

      <Box sx={rowSty}>
        <SHFSelectField
          label="Source"
          value={tier.source}
          onChange={(v) => setSource(v as PaceTierSource)}
          options={TIER_SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />

        {tier.source === 'equipment' && (
          <>
            {/* Grouped rather than filtered: a tier may legitimately be a radio,
                and a flat list labelled only by nomenclature gave no way to tell
                which kind was being picked. Grouped on the client because both
                kinds are wanted in the one list, so useEquipment stays
                unparameterised. */}
            <SHFSelectField
              label="Equipment"
              error={gapText}
              {...mark('name', 'equipment')}
              value={tier.equipmentId}
              onChange={(v) => onChange({ ...tier, equipmentId: v, serviceAbbrev: '' })}
              options={(equipmentList?.equipment ?? []).map((e) => ({
                value: e.id,
                label: e.nomenclature,
                group: e.terminal_type === 'radio' ? 'Radios' : 'SATCOM terminals',
              }))}
            />
            {/* Named for what the picked equipment actually offers. The draft
                key stays serviceAbbrev because it mirrors the stored column,
                which holds either kind of abbreviation. */}
            <SHFSelectField
              label={isRadio ? 'Waveform' : 'Service'}
              {...mark('service', isRadio ? 'waveform' : 'service')}
              value={tier.serviceAbbrev}
              // Also disabled with nothing to offer, so equipment carrying
              // neither services nor waveforms reads as not-yet rather than as
              // broken -- the same reason the component dims a disabled select.
              disabled={tier.equipmentId === '' || capabilities.length === 0}
              onChange={(v) => onChange({ ...tier, serviceAbbrev: v })}
              options={capabilities.map((cap) => ({
                value: cap.abbrev,
                label: cap.name ? `${cap.abbrev} - ${cap.name}` : cap.abbrev,
              }))}
            />
          </>
        )}

        {tier.source === 'transport' && (
          <SHFSelectField
            label="Transport"
            error={gapText}
            {...mark('name', 'transport')}
            value={tier.transportId}
            onChange={(v) => onChange({ ...tier, transportId: v })}
            options={(transportList?.transports ?? []).map((t) => ({
              value: t.id,
              label: `${t.name} (${transportKindLabel(t.kind)})`,
            }))}
          />
        )}

        {tier.source === 'custom' && (
          <SHFTextField
            label="Label"
            error={gapText}
            {...mark('name', 'label')}
            value={tier.customLabel}
            onChange={(v) => onChange({ ...tier, customLabel: v })}
          />
        )}

        {/* Printed under the name whatever the source is, so it is offered for
            every source including "not set". */}
        <SHFTextField
          label="Detail"
          {...mark('detail', 'detail')}
          value={tier.detail}
          onChange={(v) => onChange({ ...tier, detail: v })}
        />
      </Box>
    </Box>
  );
}

function draftFrom(card: PaceCard | undefined): Draft {
  return {
    title: card?.title ?? '',
    // The stored date is its own flag: present means the box is ticked.
    includeDate: Boolean(card?.effective_date),
    effectiveDate: card?.effective_date ?? '',
    version: card?.version ?? '',
    highlights: card?.highlights ?? [],
    plans: {
      jem: planDraftFrom(card, 'jem'),
      mpu5: planDraftFrom(card, 'mpu5'),
    },
    ltacRows: padFreqRows(card?.ltac_rows, LTAC_ROWS),
    tacsatRows: padFreqRows(card?.tacsat_rows, TACSAT_ROWS),
    tmnRows: padTmnRows(card?.tmn_rows),
    tiers: tierDraftsFrom(card),
  };
}

/** How many changed-marks the save would send. Counts only what toRequest
 *  keeps, so a mark parked on a blank row or an unassigned channel does not
 *  make "Clear all" claim there is something to clear. */
function countMarks(d: Draft): number {
  const lists: (readonly string[] | undefined)[] = [
    d.highlights,
    ...PACE_RADIOS.flatMap((r) => [
      d.plans[r].highlights,
      ...d.plans[r].channels.filter((c) => c.netId !== '').map((c) => c.highlights),
    ]),
    ...[...d.ltacRows, ...d.tacsatRows].filter((r) => !isBlankFreqRow(r)).map((r) => r.highlights),
    ...d.tmnRows
      .filter((r) => r.label.trim() !== '' || r.value.trim() !== '')
      .map((r) => r.highlights),
    ...d.tiers.map((t) => t.highlights),
  ];
  return lists.reduce((n, l) => n + (l?.length ?? 0), 0);
}

/** Every mark cleared, for starting the next revision. Values are untouched. */
function clearMarks(d: Draft): Draft {
  const plan = (p: PlanDraft): PlanDraft => ({
    ...p,
    highlights: [],
    channels: p.channels.map((c) => ({ ...c, highlights: [] })),
  });
  return {
    ...d,
    highlights: [],
    plans: { jem: plan(d.plans.jem), mpu5: plan(d.plans.mpu5) },
    ltacRows: d.ltacRows.map((r) => ({ ...r, highlights: [] })),
    tacsatRows: d.tacsatRows.map((r) => ({ ...r, highlights: [] })),
    tmnRows: d.tmnRows.map((r) => ({ ...r, highlights: [] })),
    tiers: d.tiers.map((t) => ({ ...t, highlights: [] })),
  };
}

function toRequest(draft: Draft): SavePaceCardRequest {
  return {
    title: draft.title.trim(),
    // Unticking clears the column rather than hiding a stored value.
    effective_date: draft.includeDate ? draft.effectiveDate : '',
    version: draft.version.trim(),
    highlights: draft.highlights,
    // The grid is padded for typing into; a row left blank is not a row.
    ltac_rows: draft.ltacRows.filter((r) => !isBlankFreqRow(r)).map(trimFreqRow),
    tacsat_rows: draft.tacsatRows.filter((r) => !isBlankFreqRow(r)).map(trimFreqRow),
    tmn_rows: draft.tmnRows
      .filter((r) => r.label.trim() !== '' || r.value.trim() !== '')
      .map((r) => ({ label: r.label.trim(), value: r.value.trim(), highlights: r.highlights ?? [] })),
    // All four go every time. Changing the source drops the fields belonging to
    // the previous one, so the request never carries a stale reference even if
    // the draft still holds it.
    tiers: draft.tiers.map((t) => ({
      tier: t.tier,
      source: t.source,
      equipment_id: t.source === 'equipment' ? t.equipmentId : '',
      service_abbrev: t.source === 'equipment' ? t.serviceAbbrev : '',
      transport_id: t.source === 'transport' ? t.transportId : '',
      custom_label: t.source === 'custom' ? t.customLabel.trim() : '',
      detail: t.detail.trim(),
      highlights: t.highlights,
    })),
    plans: PACE_RADIOS.map((radio) => {
      const plan = draft.plans[radio];
      return {
        radio_type: radio,
        label: plan.label.trim(),
        highlights: plan.highlights,
        channel_count: plan.channelCount,
        channels: plan.channels
          .map((ch, i) => ({ ch, number: i + 1 }))
          // Only assigned positions are sent; the wheel fills the gaps.
          .filter(({ ch }) => ch.netId !== '')
          .map(({ ch, number }) => ({
            channel_number: number,
            net_id: ch.netId,
            tx_freq_override: ch.txOverride.trim(),
            rx_freq_override: ch.rxOverride.trim(),
            label_override: ch.labelOverride.trim(),
            highlights: ch.highlights,
          })),
      };
    }),
  };
}

export function PaceEditorPage() {
  const { section } = useParams<{ section: string }>();
  const { hasCard, isLoading: paceSectionsLoading } = usePaceSections();
  const navigate = useNavigate();
  const { canWritePace } = useAuth();
  const { showToast } = useToast();

  const { data: sections } = useSections();
  const { data: card, isLoading, isError: cardFailed } = usePaceCard(section);
  const { data: netData, isLoading: netsLoading, isError: netsFailed } = useNets(section);
  // For the tile preview only. React Query dedupes these against the identical
  // calls in every TierRow, so the page pays for one request each rather than
  // five, and a per-tier useEquipmentItem is avoided -- that would be a hook in
  // a loop. The list endpoint selects the same columns as the detail endpoint,
  // so `data.services` is present and the rates resolve off it.
  const { data: equipmentList } = useEquipment();
  const { data: transportList } = useTransports();
  const saveCard = useSavePaceCard();
  // The emblem is not part of the draft: it is sent on selection and read back
  // off the card, so `toRequest` never carries it and a save cannot clear it.
  const uploadEmblem = useUploadPaceEmblem();
  const deleteEmblem = useDeletePaceEmblem();

  const [draft, setDraft] = useState<Draft>(() => draftFrom(undefined));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrored into a ref so the reload effect below can read the flag without
  // taking a dependency on it -- depending on `dirty` would re-run the effect
  // the moment a save clears it, resetting the draft from the pre-save card.
  const dirtyRef = useRef(false);
  const markDirty = (next: boolean) => {
    dirtyRef.current = next;
    setDirty(next);
  };

  // Adopt server state only when nothing is at risk: the first card to arrive,
  // a different squadron's, or a refetch landing on a clean form (which is the
  // post-save case, since handleSave clears dirty before the invalidation's
  // refetch resolves). A refetch while the form is dirty is deliberately
  // ignored -- resetting there would discard every keystroke since Save and
  // silently clear dirty with them, disabling Save with no sign anything went.
  const loadedSection = useRef<string | null>(null);
  useEffect(() => {
    if (!card) return;
    const sameCard = loadedSection.current === card.section;
    if (sameCard && dirtyRef.current) return;
    loadedSection.current = card.section;
    setDraft(draftFrom(card));
    dirtyRef.current = false;
    setDirty(false);
  }, [card]);

  // Warn before leaving with unsaved edits. One Save covers the whole card, so
  // navigating away mid-edit would discard every change, not just one field.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const nets = useMemo(() => netData?.nets ?? [], [netData]);


  const patch = (fn: (d: Draft) => Draft) => {
    setDraft(fn);
    markDirty(true);
  };

  // Computed before the guards below, because the emblem hook has to run on
  // every render and React forbids a hook after a conditional return.
  const sectionLabel =
    sections?.find((s) => s.key === section)?.label ?? (section ?? '').toUpperCase();

  // Same source the sheet uses, so the live preview and the printed card cannot
  // disagree about the hub. Read through the API because the stored blob URL is
  // not browser-fetchable.
  const { emblemHref } = usePaceEmblem(section, card?.emblem_url, sectionLabel);

  // Only the card-bearing squadrons resolve, so /pace/esqd - or any typo -
  // does not render a full card for a section that does not have one.
  //
  // The wait is not optional. Which squadrons have a card is a column on
  // `sections` now, so the answer arrives with a query rather than from a
  // constant; returning NotFoundPage before it lands would flash "not found" for
  // a squadron that exists, on every load.
  if (paceSectionsLoading) return <LoadingSpinner />;
  if (!section || !hasCard(section)) return <NotFoundPage />;
  if (!canWritePace) return <NotFoundPage />;

  const handleSave = async () => {
    setError(null);

    // Caught here rather than by disabling Save. A disabled button with no
    // stated reason is the same dead end as the opaque 400 this replaces, and
    // Section 06 collapses -- so the message has to name the tier and the field
    // well enough to act on with the section shut.
    const gaps = draft.tiers
      .map((t) => ({ tier: t, gap: tierGap(t) }))
      .filter((g): g is { tier: TierDraft; gap: { sourceLabel: string; field: string } } => g.gap !== null);
    if (gaps.length > 0) {
      setError(
        `Section 06 is incomplete - ${gaps
          .map((g) => `tier ${g.tier.tier} (${TIER_LABELS[g.tier.tier] ?? g.tier.tier}) has Source "${g.gap.sourceLabel}" but no ${g.gap.field}`)
          .join('; ')}. Fill it in, or set that tier's Source to "Not set".`,
      );
      return;
    }

    try {
      await saveCard.mutateAsync({ section, data: toRequest(draft) });
      // Cleared here rather than in the reload effect, so the refetch the save
      // triggers finds a clean form and is allowed to adopt the server's copy.
      markDirty(false);
      showToast('Card saved');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save the card.');
    }
  };

  const handleEmblemFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await uploadEmblem.mutateAsync({ section, file });
      showToast('Emblem uploaded');
    } catch (err) {
      showToast(
        err instanceof ApiClientError ? err.message : 'Could not upload the emblem.',
        { severity: 'error' },
      );
    }
  };

  const handleEmblemRemove = async () => {
    try {
      await deleteEmblem.mutateAsync({ section });
      showToast('Emblem removed');
    } catch (err) {
      showToast(
        err instanceof ApiClientError ? err.message : 'Could not remove the emblem.',
        { severity: 'error' },
      );
    }
  };

  const patchChannel = (radio: PaceRadio, idx: number, next: Partial<ChannelDraft>) =>
    patch((d) => ({
      ...d,
      plans: {
        ...d.plans,
        [radio]: {
          ...d.plans[radio],
          channels: d.plans[radio].channels.map((c, i) =>
            i === idx ? { ...c, ...next } : c,
          ),
        },
      },
    }));

  // Read inside the update rather than off the rendered row, so two ticks in
  // one render cannot overwrite each other.
  const markChannel = (radio: PaceRadio, idx: number, key: string, on: boolean) =>
    patch((d) => ({
      ...d,
      plans: {
        ...d.plans,
        [radio]: {
          ...d.plans[radio],
          channels: d.plans[radio].channels.map((c, i) =>
            i === idx ? { ...c, highlights: toggleMark(c.highlights, key, on) } : c,
          ),
        },
      },
    }));

  const markHeader = (key: string) => ({
    marked: isMarked(draft.highlights, key),
    onMark: (on: boolean) => patch((d) => ({ ...d, highlights: toggleMark(d.highlights, key, on) })),
  });

  const markCount = countMarks(draft);

  return (
    <MainLayout>
      {/* The same action bar the section page and the catalog trio use, rather
          than default MUI. The editor sat one click from the card and looked
          like a different product: an h5, a grey outlined button and a blue
          contained one, none of which appear anywhere else in this app. */}
      <PageBanner>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <PageTitle noWrap>{sectionLabel} - Edit PACE card</PageTitle>
          <Typography
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.08em',
              color: 'var(--shf-graphite-400)',
            }}
          >
            One Save writes the whole card.
          </Typography>
        </Box>

        <Button
          size="small"
          variant="outlined"
          onClick={() => void navigate(`/pace/${section}`)}
          sx={{
            color: 'var(--shf-amber)',
            borderColor: 'var(--shf-amber-dim)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          {dirty ? 'Discard' : 'Back to card'}
        </Button>

        {/* Save is the primary action, so it carries the filled amber the
            catalog editor's Save uses, not an outline. Disabled it goes to the
            muted graphite rather than MUI's default grey-on-grey, which read as
            missing rather than as not-yet. */}
        <Button
          size="small"
          variant="contained"
          onClick={() => void handleSave()}
          disabled={saveCard.isPending || !dirty}
          sx={{
            background: 'var(--shf-amber)',
            color: 'var(--shf-black)',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            fontSize: 11,
            flexShrink: 0,
            boxShadow: 'none',
            '&:hover': { background: 'var(--shf-amber-bright)', boxShadow: 'none' },
            '&.Mui-disabled': {
              background: 'var(--shf-graphite-700)',
              color: 'var(--shf-graphite-400)',
            },
          }}
        >
          {saveCard.isPending ? 'Saving…' : 'Save'}
        </Button>
      </PageBanner>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* The nets query gates the form as hard as the card does. Every channel
          row is a <select> over the nets, so rendering before they arrive shows
          an assigned channel as "- select -" (no matching <option>) while the
          draft still holds the net; re-picking it there silently drops that
          row's TX/RX overrides. */}
      {isLoading || netsLoading ? (
        <LoadingSpinner />
      ) : cardFailed || netsFailed ? (
        <Alert severity="error">
          {cardFailed
            ? 'Could not load this card. Nothing has been changed - reload to try again.'
            : 'Could not load this squadron’s nets, so channels cannot be assigned. Reload to try again.'}
        </Alert>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1.2fr)' },
            gap: 3,
            // Bleed to the content box's edges and let each pane pad back by
            // the content line, so the first field sits under the first letter
            // of the banner's subtitle instead of 20px right of it. The panes
            // were inset by the gutter AND padded by 20, which stacked into a
            // 32px step away from a title on the line. Same shape as the
            // catalog editor's grid, which bleeds for the same reason.
            mx: -CONTENT_GUTTER,
            mb: -CONTENT_GUTTER,
            // The grid takes the window and each pane scrolls inside it, rather
            // than the page scrolling as one. Same idiom as the catalog editor's
            // three-pane grid.
            //
            // Only from lg: below it the two panes stack, and a viewport-height
            // grid would then cut the second one off entirely.
            height: { lg: `calc(100vh - ${String(EDITOR_CHROME_H)}px)` },
            overflow: { lg: 'hidden' },
          }}
        >
          {/* Form. Two panes, not the catalog's three -- the squadron is already
              chosen by the route, so there is no list to show. */}
          <Box
            sx={{
              background: 'var(--shf-graphite-900)',
              // The content line, not a round number: this is what puts the
              // first field under the banner subtitle's first character.
              px: `${String(CONTENT_LINE)}px`,
              // Same on both axes, so the first section heading sits as far
              // below the banner as it does in from the sidebar.
              py: `${String(CONTENT_LINE)}px`,
              borderRadius: 1,
              // minHeight: 0 is what actually lets a grid child shrink below its
              // content; without it the pane grows to fit the form and the
              // scrollbar never appears. It replaces a flat 75vh cap that left a
              // quarter of the window unused at every size.
              height: { lg: '100%' },
              minHeight: 0,
              overflowY: 'auto',
            }}
          >
            <EditorFormSection eyebrow="Section 01" title="Card header" divider={false}>
              <SHFTextField
                label="Title"
                value={draft.title}
                onChange={(v) => patch((d) => ({ ...d, title: v }))}
                placeholder="Names the exercise or operation"
                {...markHeader('title')}
              />
              <SHFCheckbox
                label="Include date"
                value={draft.includeDate}
                onChange={(v) =>
                  patch((d) => ({
                    ...d,
                    includeDate: v,
                    // Unticking clears the value rather than parking it, so the
                    // form cannot hold a date the card does not show -- and
                    // clears its mark with it, for the same reason.
                    effectiveDate: v ? d.effectiveDate : '',
                    highlights: v ? d.highlights : toggleMark(d.highlights, 'date', false),
                  }))
                }
              />
              {draft.includeDate && (
                <div style={rowSty}>
                  <label style={labelSty}>Effective date</label>
                  {/* The one field here that is not a shared form primitive, so it
                      takes the tick beside it rather than inset. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="date"
                      value={draft.effectiveDate}
                      onChange={(e) => patch((d) => ({ ...d, effectiveDate: e.target.value }))}
                      onFocus={onFocus}
                      onBlur={onBlur}
                      style={{
                        ...inputSty,
                        minWidth: 0,
                        ...(isMarked(draft.highlights, 'date') ? { color: 'var(--shf-error)' } : null),
                      }}
                    />
                    <SHFMarkToggle
                      name="effective date"
                      marked={isMarked(draft.highlights, 'date')}
                      onMark={markHeader('date').onMark}
                    />
                  </div>
                </div>
              )}
              <SHFTextField
                label="Version"
                value={draft.version}
                onChange={(v) => patch((d) => ({ ...d, version: v }))}
                placeholder="e.g. v2 - printed after the date"
                {...markHeader('version')}
              />

              {/* The marks are set and cleared by hand; nothing compares one
                  save with the last. This is where the next revision starts:
                  clear the old marks, then tick what this one changes. */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
                <Typography
                  sx={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    letterSpacing: '0.06em',
                    color: markCount > 0 ? 'var(--shf-error)' : 'var(--shf-graphite-400)',
                    flex: '1 1 220px',
                  }}
                >
                  {markCount === 0
                    ? 'Tick the box in any field that changed since the last version. It prints red.'
                    : `${String(markCount)} ${markCount === 1 ? 'value' : 'values'} marked as changed - printed red.`}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={markCount === 0}
                  onClick={() => patch(clearMarks)}
                  sx={{
                    color: 'var(--shf-paper)',
                    borderColor: 'var(--shf-graphite-600)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.08em',
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  Clear all marks
                </Button>
              </Box>
            </EditorFormSection>

            {/* The emblem belongs to the card header rather than to either
                wheel, so it sits directly under the title and date. It uploads
                on selection instead of waiting for Save: it is written by its
                own endpoint and is never part of the card draft. */}
            <EditorFormSection eyebrow="Section 02" title="Squadron emblem">
              {card?.emblem_url ? (
                <div style={rowSty}>
                  <label style={labelSty}>Current</label>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box
                      component="img"
                      // emblemHref, not card.emblem_url. The stored value is a raw
                      // Azure blob URL on a container with allowBlobPublicAccess
                      // false, so a browser fetching it directly is refused - which
                      // is the entire reason usePaceEmblem exists. This thumbnail
                      // was the one call site still passing the raw URL, so it
                      // rendered the broken-image glyph while the wheel below it,
                      // fed emblemHref from the same hook on line 447, drew
                      // correctly. Tightening img-src later turned the 403 into a
                      // CSP block, which is how it was finally noticed.
                      src={emblemHref}
                      alt="Squadron emblem"
                      sx={{
                        width: 96,
                        height: 96,
                        objectFit: 'cover',
                        // Round, because the wheel hub clips it to a circle.
                        borderRadius: '50%',
                        border: '1px solid var(--shf-graphite-600)',
                        background: 'var(--shf-graphite-800)',
                      }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={deleteEmblem.isPending}
                      onClick={() => void handleEmblemRemove()}
                      sx={{
                        color: 'var(--shf-paper)',
                        borderColor: 'var(--shf-graphite-600)',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.08em',
                        fontSize: 11,
                      }}
                    >
                      Remove
                    </Button>
                  </Box>
                </div>
              ) : null}
              <div style={rowSty}>
                <label style={labelSty}>Upload</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadEmblem.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Cleared so choosing the same file twice still fires.
                    e.target.value = '';
                    void handleEmblemFile(file);
                  }}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  style={inputSty}
                />
              </div>
            </EditorFormSection>

            {PACE_RADIOS.map((radio, i) => {
              const plan = draft.plans[radio];
              // Half the wheel per column, rounded up so an odd count puts the
              // extra channel at the foot of the left one. channel_count is a
              // column (1..64), so this cannot be the constant 8.
              const columnRows = Math.ceil(plan.channels.length / 2);
              // Only nets this radio carries. The backend refuses the rest; not
              // offering them is what stops the mistake being made at all.
              // The ICE mark cannot come along here: an <option> renders text
              // and nothing else, so the designator is spelled out instead.
              // Suffixed rather than prefixed so the list still sorts and
              // scans by net name.
              const options = nets
                .filter((n) => carriedBy(n.radio_type, radio))
                .map((n) => ({ value: n.id, label: n.roip ? `${n.name} (ICE)` : n.name }));

              return (
                <EditorFormSection
                  key={radio}
                  eyebrow={`Section 0${i + 3}`}
                  title={`${PACE_RADIO_LABELS[radio]} channels`}
                  defaultOpen={i === 0}
                >
                  <SHFTextField
                    label="Wheel caption"
                    value={plan.label}
                    onChange={(v) =>
                      patch((d) => ({
                        ...d,
                        plans: { ...d.plans, [radio]: { ...d.plans[radio], label: v } },
                      }))
                    }
                    placeholder="Blank renders no caption"
                    marked={isMarked(plan.highlights, 'label')}
                    onMark={(on) =>
                      patch((d) => ({
                        ...d,
                        plans: {
                          ...d.plans,
                          [radio]: { ...d.plans[radio], highlights: toggleMark(d.plans[radio].highlights, 'label', on) },
                        },
                      }))
                    }
                  />

                  {/* Two columns, filled DOWN each one: channels 1..8 on the left,
                      9..16 on the right.

                      That is the wheel's own halves. Channel 1 sits at 6 o'clock and
                      numbering runs clockwise, so 2..8 are the wheel's left side, 9 is
                      at 12 o'clock, and 10..16 are its right side -- measured on a
                      rendered wheel, not inferred. The editor's columns therefore map
                      onto the preview beside it. Filling across instead would also put
                      every odd channel in the left column and every even one in the
                      right, which is a poor way to read a numbered list.

                      One select spanning the whole form pane was a lot of width for a
                      short net name, and sixteen of them put the end of the wheel below
                      the fold.

                      `gridAutoFlow: 'column'` is unconditional and the row count is what
                      carries the breakpoint: at xs the rows are the full channel count
                      against a single column, so the same flow lays them out 1..16 in
                      one column. That keeps the flow out of a media query, which is the
                      property a test can actually assert -- jsdom does not evaluate the
                      sm rule.

                      The channels stay in DOM order 1..16 either way, so the tab order
                      runs down the left column and then down the right. */}
                  <Box
                    sx={{
                      display: 'grid',
                      gridAutoFlow: 'column',
                      // minmax(0, 1fr), never a bare 1fr: that is minmax(auto, 1fr) and
                      // refuses to shrink below its content, so a long net name in the
                      // select would push its column past half and overflow the pane.
                      // Same trap the preview grid below carries a note about.
                      gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                      gridTemplateRows: {
                        xs: `repeat(${String(plan.channels.length)}, auto)`,
                        sm: `repeat(${String(columnRows)}, auto)`,
                      },
                      // Wider across than down: channel 9's right-aligned number sits
                      // immediately beside channel 1's select and would otherwise read
                      // as belonging to it.
                      columnGap: 2,
                      rowGap: 0.5,
                      // An assigned channel is taller than an empty one. Without this
                      // the pair stretches to match and the shorter one's select stops
                      // sitting level with its partner.
                      alignItems: 'start',
                    }}
                  >
                    {plan.channels.map((ch, idx) => (
                      <Box
                        key={idx}
                        sx={{
                          display: 'grid',
                          // 16px, left-aligned, so the number starts on the
                          // Wheel caption field's left edge instead of floating
                          // inside a right-aligned 26px gutter. Two mono digits
                          // at 12px measure about 14. Every pixel here comes
                          // straight off the select and the TX/RX pair, which
                          // since the changed ticks each give up a tick's width.
                          gridTemplateColumns: '16px 1fr',
                          gap: 0.75,
                          alignItems: 'start',
                        }}
                      >
                        <Box
                          sx={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            color: ch.netId ? 'var(--shf-amber)' : 'var(--shf-graphite-400)',
                            pt: 1,
                            textAlign: 'left',
                          }}
                        >
                          {idx + 1}
                        </Box>
                        <Box>
                          <SHFSelectField
                            // The row's only visible label is the channel number
                            // beside it, which is not tied to the control. Naming
                            // it here is what a screen reader reads out, and what
                            // lets a test address one channel rather than count
                            // every select on the page.
                            ariaLabel={`Channel ${idx + 1} net`}
                            value={ch.netId}
                            onChange={(v) => patchChannel(radio, idx, { netId: v })}
                            options={options}
                            // Only on an assigned channel: an empty position
                            // has no row to carry the mark, so a tick there
                            // would be dropped on save.
                            {...(ch.netId
                              ? {
                                  marked: isMarked(ch.highlights, 'net'),
                                  onMark: (on: boolean) => markChannel(radio, idx, 'net', on),
                                  markName: `channel ${String(idx + 1)} net`,
                                }
                              : null)}
                          />
                          {ch.netId && (
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                // Measured, not felt. At the lg boundary the form
                                // pane is at its narrowest -- below lg the panes
                                // stack and it gets the whole window -- and there
                                // the 8px gutter left each field 64.3px of usable
                                // width against 66.5px of "TX override", so the
                                // placeholder clipped. 4px, with the row's number
                                // column narrowed, buys it back with room to spare.
                                gap: 0.5,
                                mt: -0.5,
                              }}
                            >
                              {/* The tick marks the printed TX or RX, whether
                                  it is an override or the net's own. */}
                              <SHFTextField
                                value={ch.txOverride}
                                onChange={(v) => patchChannel(radio, idx, { txOverride: v })}
                                placeholder="TX override"
                                marked={isMarked(ch.highlights, 'tx')}
                                onMark={(on) => markChannel(radio, idx, 'tx', on)}
                                markName={`channel ${String(idx + 1)} TX`}
                              />
                              <SHFTextField
                                value={ch.rxOverride}
                                onChange={(v) => patchChannel(radio, idx, { rxOverride: v })}
                                placeholder="RX override"
                                marked={isMarked(ch.highlights, 'rx')}
                                onMark={(on) => markChannel(radio, idx, 'rx', on)}
                                markName={`channel ${String(idx + 1)} RX`}
                              />
                            </Box>
                          )}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </EditorFormSection>
              );
            })}

            {/* Section 05: the sheet's middle band. A fixed grid rather than
                add/remove buttons -- a blank row simply is not a row, and
                toRequest drops it before the save.

                Each entry is a numbered two-line block; LTAC_LINES says why.
                EVERY box carries its own title above it, in every entry. A
                heading block over the first row only was tried: it stopped
                meaning anything the moment the table scrolled. Only mb: 0.5
                between entries: every field already carries 12px beneath it,
                and the next entry's titles separate the two on their own. A
                full mb: 2 on top of that read as a gap after every SAT/CRYPTO
                line. */}
            <EditorFormSection eyebrow="Section 05" title="Sheet tables">
              {([
                { key: 'ltacRows' as const, title: 'LTAC', lines: LTAC_LINES },
                { key: 'tacsatRows' as const, title: 'TACSAT', lines: TACSAT_LINES },
              ]).map(({ key, title, lines }) => (
                <Box key={key} sx={{ mb: 2 }}>
                  <Typography
                    sx={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      letterSpacing: '0.12em',
                      color: 'var(--shf-amber)',
                      mb: 0.5,
                    }}
                  >
                    {title}
                  </Typography>
                  {draft[key].map((row, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: BAND_ROW_COLS,
                        gap: 0.75,
                        alignItems: 'start',
                        mb: 0.5,
                      }}
                    >
                      <Box
                        sx={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          color: isBlankFreqRow(row) ? 'var(--shf-graphite-400)' : 'var(--shf-amber)',
                          // Level with the first box rather than its title:
                          // the 1 the channel rows use, plus the title's height.
                          pt: BAND_NUMBER_PT,
                        }}
                      >
                        {idx + 1}
                      </Box>
                      <Box>
                        {lines.map((line, li) => (
                          <Box
                            key={li}
                            data-band-line
                            sx={{ display: 'grid', gridTemplateColumns: BAND_GRID_COLS, gap: 0.5 }}
                          >
                            {line.map((cell, ci) =>
                              cell ? (
                                <SHFTextField
                                  key={cell.key}
                                  label={cell.label}
                                  // Named in full: every box in a column shares
                                  // the title "up", so the title alone would give
                                  // eight ticks one accessible name.
                                  markName={`${title} ${String(idx + 1)} ${cell.label}`}
                                  value={row[cell.key]}
                                  placeholder={`${title} ${String(idx + 1)} ${cell.label}`}
                                  onChange={(v) =>
                                    patch((d) => ({
                                      ...d,
                                      [key]: d[key].map((r, i) =>
                                        i === idx ? { ...r, [cell.key]: v } : r,
                                      ),
                                    }))
                                  }
                                  marked={isMarked(row.highlights, cell.key)}
                                  onMark={(on) =>
                                    patch((d) => ({
                                      ...d,
                                      [key]: d[key].map((r, i) =>
                                        i === idx ? { ...r, highlights: toggleMark(r.highlights, cell.key, on) } : r,
                                      ),
                                    }))
                                  }
                                />
                              ) : (
                                <div key={ci} />
                              ),
                            )}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Box>
              ))}

              <Typography
                sx={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  color: 'var(--shf-amber)',
                  mb: 0.5,
                }}
              >
                TACTICAL MISSION NETWORK
              </Typography>
              {/* One line per entry: two cells and their ticks fit a half pane.
                  Numbered on the same gutter as LTAC and TACSAT, and titled on
                  every box for the same reason they are. */}
              {draft.tmnRows.map((row, idx) => (
                <Box
                  key={idx}
                  sx={{ display: 'grid', gridTemplateColumns: BAND_ROW_COLS, gap: 0.75, alignItems: 'start' }}
                >
                  <Box
                    sx={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 12,
                      color: row.label.trim() || row.value.trim() ? 'var(--shf-amber)' : 'var(--shf-graphite-400)',
                      pt: BAND_NUMBER_PT,
                    }}
                  >
                    {idx + 1}
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 0.5 }}>
                  {(['label', 'value'] as const).map((field) => (
                    <SHFTextField
                      key={field}
                      label={field}
                      markName={`TACTICAL MISSION NETWORK ${String(idx + 1)} ${field}`}
                      value={row[field]}
                      placeholder={`${field === 'label' ? 'Label' : 'Value'} ${String(idx + 1)}`}
                      onChange={(v) =>
                        patch((d) => ({
                          ...d,
                          tmnRows: d.tmnRows.map((r, i) =>
                            i === idx ? { ...r, [field]: v } : r,
                          ),
                        }))
                      }
                      marked={isMarked(row.highlights, field)}
                      onMark={(on) =>
                        patch((d) => ({
                          ...d,
                          tmnRows: d.tmnRows.map((r, i) =>
                            i === idx ? { ...r, highlights: toggleMark(r.highlights, field, on) } : r,
                          ),
                        }))
                      }
                    />
                  ))}
                  </Box>
                </Box>
              ))}
            </EditorFormSection>

            {/* Section 06: what fills the four PACE tiles. One row per tier,
                with the fields the chosen source calls for and nothing else,
                so the row is never asking for a terminal and a transport at
                the same time. */}
            <EditorFormSection eyebrow="Section 06" title="PACE options">
              {draft.tiers.map((tier, idx) => (
                <TierRow
                  key={tier.tier}
                  tier={tier}
                  onChange={(next) =>
                    // patch, not setDraft: it is what marks the form dirty, and
                    // without it Save stays disabled after a tier edit.
                    patch((d) => ({
                      ...d,
                      tiers: d.tiers.map((t, i) => (i === idx ? next : t)),
                    }))
                  }
                />
              ))}
            </EditorFormSection>

          </Box>

          {/* Live preview. Free, because the wheel is a pure render -- this is
              the payoff for having kept it so.

              Capped at the width the wheel actually gets on the sheet. The SVG
              is width="100%", so in an uncapped pane it scaled to whatever the
              column happened to be: on a wide monitor that rendered each wheel
              at over 1000px against a 580-unit viewBox, which is the "giant"
              preview. The sheet lays the two wheels across 1056px, so half that
              is the size the squadron will actually print. */}
          <Box
            sx={{
              background: 'var(--shf-paper)',
              color: 'var(--fg-1)',
              // Matches the form pane rather than its own former 16px, so the
              // two panes' contents start the same distance in.
              px: `${String(CONTENT_LINE)}px`,
              py: `${String(CONTENT_LINE)}px`,
              borderRadius: 1,
              // The pane scrolls itself now that the grid is the height of the
              // window, so there is nothing left for a sticky pane to stick to.
              height: { lg: '100%' },
              minHeight: 0,
              overflowY: 'auto',
              display: 'grid',
              // The wheels column is a fraction, NEVER `auto` or content-sized.
              // ChannelWheel renders <svg width="100%"> with no intrinsic size,
              // so a content-sized column gives that percentage nothing to
              // resolve against and the browser falls back to the 300px it hands
              // any replaced element with no dimensions. `minmax(0, 1fr)` is
              // definite, which is what makes the cap below a cap rather than
              // the only sizing there is.
              gridTemplateColumns: {
                xs: '1fr',
                md: `minmax(0, 1fr) ${String(TILE_PREVIEW_W)}px`,
              },
              gap: 2,
              alignItems: 'start',
              maxWidth: WHEEL_PREVIEW_W + TILE_PREVIEW_W + 16 + 32,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              {PACE_RADIOS.map((radio) => {
                const plan = draft.plans[radio];
                return (
                  <Box key={radio} sx={{ width: '100%', maxWidth: WHEEL_PREVIEW_W }}>
                    <ChannelWheel
                      title={`${PACE_RADIO_LABELS[radio]} channel wheel`}
                      caption={plan.label}
                      captionMarked={isMarked(plan.highlights, 'label')}
                      channelCount={plan.channelCount}
                      // The preview drew an empty hub: it never received an
                      // emblem, so uploading one changed the thumbnail above and
                      // nothing here, which reads as the upload having failed.
                      // Same fallback the sheet uses, from the same function, so
                      // the two cannot disagree about what a squadron with no
                      // emblem looks like.
                      emblemUrl={emblemHref}
                      assignments={plan.channels
                        .map((ch, i) => ({ ch, number: i + 1 }))
                        .filter(({ ch }) => ch.netId !== '')
                        .map(({ ch, number }) => {
                          const net = nets.find((n) => n.id === ch.netId);
                          return {
                            channel: number,
                            netName: ch.labelOverride || net?.name || '',
                            // The wheel prints this in its accessible table.
                            netId: net?.net_id ?? '',
                            // Straight off the full Net the picker was built
                            // from, so the preview shows the mark without
                            // waiting on a save and a re-fetch of the card.
                            roip: net?.roip ?? false,
                            txFreq: ch.txOverride || net?.tx_freq || '',
                            rxFreq: ch.rxOverride || net?.rx_freq || '',
                            freqUnit: net?.freq_unit ?? '',
                            highlights: ch.highlights,
                          };
                        })}
                    />
                  </Box>
                );
              })}
            </Box>

            {/* The same PaceTile the sheet prints, drawn from the draft rather
                than from a saved card. Without it a squadron had to Save, go
                back to the card, look, and come back in to edit -- three
                navigations to check one dropdown. */}
            <Box sx={{ minWidth: 0 }}>
              {PACE_TIERS.map((t, i) => (
                <PaceTile
                  key={t.key}
                  letter={t.key}
                  label={t.label}
                  tier={tierPreviewFrom(
                    draft.tiers[i],
                    equipmentList?.equipment ?? [],
                    transportList?.transports ?? [],
                  )}
                />
              ))}
            </Box>
          </Box>
        </Box>
      )}
    </MainLayout>
  );
}
