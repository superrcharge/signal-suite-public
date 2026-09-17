import { useState, useCallback, useEffect, useRef, CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Box, Button, CircularProgress, Tooltip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined';
import SaveIcon from '@mui/icons-material/Save';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { MainLayout } from '@/components/layouts';
import { PageBanner, RailTitle } from '@/components/common';
import { BANNER_BTN_AMBER_SX, BANNER_BTN_PAPER_SX, BANNER_BTN_PRIMARY_SX, BANNER_ICON_BTN_SX, CONTENT_LINE, RAIL_BANNER_H } from '@/components/common/banner-controls';
import { CONTENT_GUTTER, HEADER_HEIGHT } from '@/components/layouts/main-layout';
import { DataSheetView, PhotoCropModal, EquipmentPhoto, CATALOG_RAIL_W } from '@/components/catalog';
import {
  SATCOM_BAND_OPTS, RADIO_BAND_OPTS, ORBIT_OPTS, OPMODE_OPTS,
} from '@/components/catalog/catalog-vocab';
import {
  useEquipment, useEquipmentItem,
  useCreateEquipment, useUpdateEquipment, useDeleteEquipment, useUploadEquipmentPhoto,
  useWaveforms, useServices,
} from '@/services';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/contexts';
import { EMPTY_VALUE, compareNatural } from '@/utils';
import {
  EditorFormSection,
  SHFCheckbox,
  SHFMultiCheck,
  SHFNumberField,
  SHFRowList,
  SHFSelectField,
  SHFTextField,
} from '@/components/shf-form';
import { inputSty, labelSty, onBlur, onFocus, rowSty } from '@/components/shf-form/styles';
import type {
  Equipment, EquipmentData, EquipmentService,
  CompatibilityComparison, EquipmentBand, SpecRow, EquipmentSwap,
  EquipmentFeature, TerminalType, Waveform, Service,
} from '@/types';
import { blankDraft, type EditorDraft } from './catalog-editor-draft';
import '@/styles/catalog-tokens.css';

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * What the 3-pane grid gives up to the chrome above it, so `100vh` minus this
 * is the height left for the panes.
 *
 * Built from the parts rather than written as one number. It used to read
 * `calc(100vh - 120px)`, which said nothing about which 120 and was measured
 * against a grid that still sat inside the layout gutter; then `36`, measured
 * against a banner of 14px text and small buttons, which the 30px banner
 * controls outgrew by 8px, and the grid overran `#main-content` by exactly
 * that at the 1280x720 floor. `RAIL_BANNER_H` is the banner's height derived
 * from what it holds, so the two cannot drift again. (`pace-editor-page.tsx`
 * carries taller controls and its own number, on purpose.)
 *
 * **There is no bottom-gutter term, unlike pace's.** This grid cancels the
 * gutter with its own negative margin below, so subtracting it as well would
 * pay for it twice.
 */
const EDITOR_CHROME_H = HEADER_HEIGHT + RAIL_BANNER_H;

/** Derive a URL-safe slug from a nomenclature string. Used as the equipment ID on create. */
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);


// ─── Draft type (flat for easy editing, assembled on save) ──────────────────

function equipmentToDraft(eq: Equipment): EditorDraft {
  const d = eq.data ?? {} as EquipmentData;
  const ss = (d.standard_specs ?? {}) as Record<string, unknown>;
  return {
    id: eq.id,
    nomenclature: eq.nomenclature,
    nickname: eq.nickname ?? '',
    one_liner: eq.one_liner ?? '',
    doc_number: eq.doc_number ?? '',
    photo_url: eq.photo_url ?? '',
    make: eq.make ?? '',
    terminal_type: eq.terminal_type,
    operational_mode: eq.operational_mode ?? [],
    services: d.services ?? [],
    waveforms: d.waveforms ?? [],
    compat_comparisons: d.compatibility?.comparisons ?? [],
    bands: d.bands ?? [],
    standard_specs: ss,
    physical_specs: d.physical_specs ?? [],
    rf_specs: d.rf_specs ?? [],
    swap: d.swap ?? {},
    features: d.features ?? [],
    accessories: typeof d.accessories === 'string' ? d.accessories : '',
    use_cases: d.use_cases ?? '',
  };
}

function draftToEquipment(draft: EditorDraft): Equipment {
  return {
    id: draft.id,
    nomenclature: draft.nomenclature || 'Untitled',
    nickname: draft.nickname || undefined,
    one_liner: draft.one_liner || undefined,
    doc_number: draft.doc_number || undefined,
    photo_url: draft.photo_url || undefined,
    make: draft.make || undefined,
    terminal_type: draft.terminal_type,
    operational_mode: draft.operational_mode,
    data: {
      services: draft.services,
      waveforms: draft.waveforms,
      compatibility: { comparisons: draft.compat_comparisons },
      bands: draft.bands,
      standard_specs: draft.standard_specs as EquipmentData['standard_specs'],
      physical_specs: draft.physical_specs,
      rf_specs: draft.rf_specs,
      swap: draft.swap,
      features: draft.features,
      accessories: draft.accessories || undefined,
      use_cases: draft.use_cases || undefined,
    },
    created_by: '', updated_by: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Radio frequency range: Min/Max numeric pair (up to 4 decimals) with a MHz/GHz unit
// designation. The unit is a label only - switching it does NOT convert the values.
interface FreqRangeProps { band: EquipmentBand; update: (patch: Partial<EquipmentBand>) => void; }
// Parse an input string to a number capped at 4 decimal places (empty → undefined).
function parseFreq(raw: string): number | undefined {
  if (raw === '') return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : Number(n.toFixed(4));
}
function SHFFreqRange({ band, update }: FreqRangeProps) {
  const unit = band.freq_unit ?? 'MHz';
  const invalid = band.freq_min != null && band.freq_max != null && band.freq_min > band.freq_max;
  const numSty: CSSProperties = { ...inputSty, fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={rowSty}>
      <label style={labelSty}>
        Frequency Range
        {(['MHz', 'GHz'] as const).map((u) => {
          const active = unit === u;
          return (
            <button key={u} type="button" onClick={() => update({ freq_unit: u })}
              style={{
                marginLeft: u === 'MHz' ? 8 : 2, padding: '0 5px', lineHeight: '16px',
                fontSize: 10, fontFamily: 'var(--font-mono)', borderRadius: 3,
                border: '1px solid', cursor: 'pointer',
                background: active ? 'var(--shf-amber)' : 'transparent',
                color: active ? '#000' : 'var(--shf-graphite-300)',
                borderColor: active ? 'var(--shf-amber)' : 'var(--shf-graphite-600)',
              }}
            >{u}</button>
          );
        })}
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
        <input type="number" step="0.0001" value={band.freq_min ?? ''} placeholder="Min"
          onChange={e => update({ freq_min: parseFreq(e.target.value) })}
          onFocus={onFocus} onBlur={onBlur}
          style={numSty} />
        <input type="number" step="0.0001" value={band.freq_max ?? ''} placeholder="Max"
          onChange={e => update({ freq_max: parseFreq(e.target.value) })}
          onFocus={onFocus}
          onBlur={e => { e.target.style.borderColor = invalid ? '#D43A2F' : 'var(--shf-graphite-600)'; }}
          style={{ ...numSty, borderColor: invalid ? '#D43A2F' : 'var(--shf-graphite-600)' }} />
      </div>
      {invalid && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#D43A2F', letterSpacing: '0.06em', marginTop: 4 }}>
          Min must be ≤ Max
        </div>
      )}
    </div>
  );
}

// Weight: lbs / oz / combined lbs+oz entry. The unit is a designation only - switching
// modes relabels which field(s) are shown and does NOT convert values. `weight` is always
// pounds, `weight_oz` always ounces; absent weight_unit = legacy 'lbs'.
const WEIGHT_MODES: { value: NonNullable<EquipmentSwap['weight_unit']>; label: string }[] = [
  { value: 'lbs', label: 'lbs' },
  { value: 'oz', label: 'oz' },
  { value: 'lbs_oz', label: 'lbs+oz' },
];
interface WeightProps { swap: EquipmentSwap; setSwap: (patch: Partial<EquipmentSwap>) => void; }
function SHFWeight({ swap, setSwap }: WeightProps) {
  const mode = swap.weight_unit ?? 'lbs';
  const numSty: CSSProperties = { ...inputSty, fontVariantNumeric: 'tabular-nums' };
  const toNum = (raw: string): number | undefined => (raw === '' ? undefined : Number(raw));
  // Combined mode only: carry a whole-lbs worth of ounces (>= 16) up into pounds.
  const rolloverOz = () => {
    const oz = swap.weight_oz;
    if (oz != null && oz >= 16) {
      setSwap({ weight: (swap.weight ?? 0) + Math.floor(oz / 16), weight_oz: Number((oz % 16).toFixed(4)) });
    }
  };
  const lbsInput = (
    <input type="number" step="any" value={swap.weight ?? ''} placeholder="lbs"
      onChange={e => setSwap({ weight: toNum(e.target.value) })}
      onFocus={onFocus} onBlur={onBlur} style={numSty} />
  );
  const ozInput = (onBlurExtra?: () => void) => (
    <input type="number" step="any" value={swap.weight_oz ?? ''} placeholder="oz"
      onChange={e => setSwap({ weight_oz: toNum(e.target.value) })}
      onFocus={onFocus} onBlur={e => { onBlur(e); onBlurExtra?.(); }} style={numSty} />
  );
  return (
    <div style={rowSty}>
      <label style={labelSty}>
        Weight
        {WEIGHT_MODES.map((m, i) => {
          const active = mode === m.value;
          return (
            <button key={m.value} type="button" onClick={() => setSwap({ weight_unit: m.value })}
              style={{
                marginLeft: i === 0 ? 8 : 2, padding: '0 5px', lineHeight: '16px',
                fontSize: 10, fontFamily: 'var(--font-mono)', borderRadius: 3,
                border: '1px solid', cursor: 'pointer',
                background: active ? 'var(--shf-amber)' : 'transparent',
                color: active ? '#000' : 'var(--shf-graphite-300)',
                borderColor: active ? 'var(--shf-amber)' : 'var(--shf-graphite-600)',
              }}
            >{m.label}</button>
          );
        })}
      </label>
      {mode === 'lbs' && lbsInput}
      {mode === 'oz' && ozInput()}
      {mode === 'lbs_oz' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 10px' }}>
          {lbsInput}
          {ozInput(rolloverOz)}
        </div>
      )}
    </div>
  );
}

// True when any band has both a min and max frequency with min > max.
function hasInvalidBandRange(bands: EquipmentBand[]): boolean {
  return bands.some(b => b.freq_min != null && b.freq_max != null && b.freq_min > b.freq_max);
}

// Abbrevs are compared case-insensitively to match the services_abbrev_lower_idx
// unique index - an exact-match test would read "gx" as an orphan of "GX".
const normAbbrev = (a: string) => a.trim().toLowerCase();

/**
 * True when a service row carries rate figures. Rates are typed in by hand and
 * differ terminal to terminal, so they are the part of a row that cannot be
 * recovered by re-adding the service from the library.
 */
function hasServiceRates(svc: EquipmentService): boolean {
  return [svc.cir?.dl, svc.cir?.ul, svc.mir?.dl, svc.mir?.ul].some(v => v != null);
}

// ─── Left pane: equipment list ───────────────────────────────────────────────

interface ListPaneProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: (type: TerminalType) => void;
}
type ListTab = 'all' | 'satcom' | 'radio';

function EquipmentListPane({ activeId, onSelect, onNew }: ListPaneProps) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<ListTab>('all');
  const { canWrite } = useAuth();
  const { data, isLoading } = useEquipment();
  const items = data?.equipment ?? [];

  // An rto writer cannot save a satcom record, so + SATCOM could only ever
  // hand them the editor's refusal screen. Offer the one they can save.
  const newTypes: TerminalType[] = canWrite ? ['satcom', 'radio'] : ['radio'];

  const byTab = items.filter(eq => {
    if (tab === 'satcom') return eq.terminal_type !== 'radio';
    if (tab === 'radio')  return eq.terminal_type === 'radio';
    return true;
  });

  const bySearch = byTab.filter(eq => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [eq.nomenclature, eq.nickname ?? '', eq.make ?? '', eq.id].join(' ').toLowerCase().includes(q);
  });

  // All tab: SATCOM first (alpha), then Radio (alpha). Other tabs: just alpha.
  const alpha = (a: { nomenclature: string }, b: { nomenclature: string }) =>
    compareNatural(a.nomenclature, b.nomenclature);
  const filtered = tab === 'all'
    ? [
        ...bySearch.filter(eq => eq.terminal_type !== 'radio').sort(alpha),
        ...bySearch.filter(eq => eq.terminal_type === 'radio').sort(alpha),
      ]
    : [...bySearch].sort(alpha);

  const tabBtn = (t: ListTab, label: string) => {
    const active = tab === t;
    return (
      <button key={t} onClick={() => setTab(t)} style={{
        flex: 1, padding: '6px 0', background: 'transparent', border: 'none',
        borderBottom: `2px solid ${active ? 'var(--shf-amber)' : 'transparent'}`,
        color: active ? 'var(--shf-amber)' : 'var(--shf-graphite-400)',
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10,
        letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
        transition: 'color 0.15s, border-color 0.15s',
      }}>{label}</button>
    );
  };

  return (
    <div style={{
      background: 'var(--shf-graphite-900)',
      borderRight: '1px solid var(--shf-graphite-700)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--shf-graphite-700)' }}>
        {tabBtn('all', 'All')}
        {tabBtn('satcom', 'SATCOM')}
        {tabBtn('radio', 'Radio')}
      </div>

      {/* The content line on both sides: the search box starts on the banner
          title's line, and the rows' badge below starts there too (3px active
          bar + 19px + 6px). */}
      <div style={{ padding: `8px ${String(CONTENT_LINE)}px 6px`, borderBottom: '1px solid var(--shf-graphite-700)' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search equipment…"
          style={{ ...inputSty, fontSize: 12 }}
          onFocus={onFocus} onBlur={onBlur}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px 8px' }}>
        {isLoading && <div style={{ padding: 14, color: 'var(--shf-graphite-400)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Loading…</div>}
        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 14, color: 'var(--shf-graphite-400)', fontFamily: 'var(--font-body)', fontSize: 12, fontStyle: 'italic' }}>
            {items.length === 0 ? 'No equipment yet. Add one below.' : 'No matches.'}
          </div>
        )}
        {filtered.map(eq => {
          const active = eq.id === activeId;
          const isSatcom = eq.terminal_type !== 'radio';
          return (
            <div
              key={eq.id}
              onClick={() => onSelect(eq.id)}
              style={{
                padding: '8px 19px', marginBottom: 4,
                background: active ? 'var(--shf-graphite-700)' : 'transparent',
                borderLeft: `3px solid ${active ? 'var(--shf-amber)' : 'transparent'}`,
                cursor: 'pointer', borderRadius: 0,
              }}
            >
              {/* Top-aligned: the badge sits on the name line, not centred
                  against the name and maker together. */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{
                  padding: '1px 5px', borderRadius: 2, marginTop: 2,
                  background: isSatcom ? 'var(--shf-amber)' : 'var(--shf-info)',
                  color: isSatcom ? 'var(--shf-black)' : 'var(--shf-paper)',
                  fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0,
                }}>{isSatcom ? 'SAT' : 'RAD'}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    color: active ? 'var(--shf-amber)' : 'var(--shf-paper)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{eq.nomenclature || 'Untitled'}</div>
                  {eq.make && (
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
                      color: 'var(--shf-graphite-400)', marginTop: 1,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{eq.make}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: 8, borderTop: '1px solid var(--shf-graphite-700)', display: 'grid', gridTemplateColumns: newTypes.length > 1 ? '1fr 1fr' : '1fr', gap: 6 }}>
        {newTypes.map(t => (
          <button key={t} onClick={() => onNew(t)} style={{
            padding: '6px 10px', background: 'transparent',
            border: '1px dashed var(--shf-amber)', color: 'var(--shf-amber)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10.5,
            letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 2,
            // Flex, so the plus and the label are centred against each other
            // rather than sharing a text baseline. On a baseline a larger glyph
            // sits low, which is what made it look off next to the word.
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          }}>
            {/* The plus reads as punctuation at the label's size, and it is the
                part that says "new", so it carries its own. */}
            <span style={{ fontSize: 18, lineHeight: 1, letterSpacing: 0 }}>+</span>
            {t.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Center pane: form ───────────────────────────────────────────────────────

interface FormPaneProps {
  draft: EditorDraft;
  isNew: boolean;
  globalWaveforms: Waveform[];
  globalServices: Service[];
  // An empty library and an unreachable one look identical in globalServices,
  // so the chip area needs to know which it is before telling the user the
  // library is empty.
  servicesUnavailable: boolean;
  onPatch: (patch: Partial<EditorDraft>) => void;
  /** The preview toggle lives here rather than in the page topbar, so it does
   *  not change rows when it flips. */
  /**
   * Whether this caller may edit THIS draft - `canEditDraft` from the page.
   *
   * Passed rather than recomputed here, because the rule reads the record as
   * well as the user ("an rto may edit a radio record but not a satcom one"),
   * and two copies of a per-record rule is two things to keep in step. The page
   * already early-returns a refusal when this is false, so today it is always
   * true here; the write controls below gate on it anyway, because a gate
   * inherited from a parent is not a gate this component has - which is the
   * defect the WaveformLibraryPane fix in an earlier release records.
   */
  canEdit: boolean;
}

/**
 * Exported for tests only - nothing else imports it, and the page below is the
 * sole caller.
 *
 * `canEdit` is false only in a situation the page prevents by refusing first,
 * so that branch is unreachable through `CatalogEditorPage` and cannot be
 * covered by rendering the page. Exporting the pane is what lets the gate be
 * asserted in the direction that matters: that the control disappears, not just
 * that it appears. Without it the photo gate could be deleted outright and
 * every page-level test would stay green.
 */
export function EquipmentFormPane({ draft, isNew, globalWaveforms, globalServices, servicesUnavailable, onPatch, canEdit }: FormPaneProps) {
  const isSatcom = draft.terminal_type !== 'radio';
  const bandOpts = isSatcom ? SATCOM_BAND_OPTS : RADIO_BAND_OPTS;
  const photoInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadEquipmentPhoto();

  // Radio inventory - used for Section 03b waveform compatibility chip grid
  const { data: equipmentData } = useEquipment();
  const inventoryRadios = (equipmentData?.equipment ?? []).filter(
    eq => eq.terminal_type === 'radio' && eq.id !== draft.id,
  );
  const [cropFile, setCropFile] = useState<File | null>(null);

  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isNew) return;
    setCropFile(file);
    e.target.value = '';
  };

  const handleCropConfirm = (file: File) => {
    setCropFile(null);
    uploadMutation.mutate({ id: draft.id, file }, {
      onSuccess: (url) => onPatch({ photo_url: url }),
    });
  };

  const setSpec = (key: string, val: unknown) =>
    onPatch({ standard_specs: { ...draft.standard_specs, [key]: val } });
  const setSwap = (patch: Partial<EquipmentSwap>) =>
    onPatch({ swap: { ...draft.swap, ...patch } });
  const setSize = (patch: object) =>
    onPatch({ swap: { ...draft.swap, size: { ...draft.swap?.size, ...patch } } });

  const ss = draft.standard_specs;

  // Hoisted out of the Services section's JSX so the row renderer can tell a
  // library-owned row from one typed in here.
  const serviceLibraryAbbrevs = new Set(globalServices.map(s => normAbbrev(s.abbrev)));
  const selectedServices = new Set(draft.services.map(s => normAbbrev(s.abbrev)));
  const orphanServices = draft.services.filter(
    s => !serviceLibraryAbbrevs.has(normAbbrev(s.abbrev)),
  );

  // One gate in front of every path that can drop a service row: a library
  // chip, an orphan chip, and the row list's own ✕ all land here. Un-ticking
  // discards the whole row, and re-ticking brings back library defaults only -
  // so the hand-entered CIR/MIR figures are gone with no undo. Rows without
  // rates pass straight through; there is nothing to lose and nothing to ask.
  const commitServices = (next: EquipmentService[]) => {
    // Only a removal can lose anything. Edits and reorders keep every row, and
    // the abbrev is editable on a hand-entered row -- without this check,
    // retyping it would look like a removal and prompt on every keystroke.
    if (next.length >= draft.services.length) {
      onPatch({ services: next });
      return;
    }
    const kept = new Set(next.map(s => normAbbrev(s.abbrev)));
    const losing = draft.services.filter(
      s => !kept.has(normAbbrev(s.abbrev)) && hasServiceRates(s),
    );
    if (losing.length > 0) {
      const names = losing.map(s => s.abbrev || 'this service').join(', ');
      const them = losing.length > 1 ? 'them' : 'it';
      if (!window.confirm(`Remove ${names}? The CIR/MIR rates entered for ${them} will be lost.`)) {
        return;
      }
    }
    onPatch({ services: next });
  };

  return (
    <>
      <div style={{
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: 'var(--shf-graphite-900)',
        borderRight: '1px solid var(--shf-graphite-700)',
      }}>
        {/* No toolbar of its own: the record name, Duplicate, Delete, Save and
            the preview toggle all live in the page banner, the way the sheet
            page keeps its actions in one bar. The grey strip that held them
            here was a second header row spending 50px above the form. */}
        {/* Scrollable form body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 60px' }}>

          {/* IDENTIFICATION */}
          <EditorFormSection eyebrow="Section 01" title="Identification" divider={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
              <SHFTextField label="ID (slug)" value={draft.id}
                onChange={v => onPatch({ id: v.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                placeholder="hornet" />
              <SHFSelectField label="Terminal Type" value={draft.terminal_type}
                onChange={v => {
                  const t = (v as TerminalType) || 'satcom';
                  const std = t === 'radio'
                    ? { antennaType: '', transmitPower: null, crypto: '', range: null }
                    : { antennaType: '', reflector: '', modem: '', orbit: '', bucTransmitPower: null, windTolerance: null, altPntAvailable: null };
                  onPatch({ terminal_type: t, standard_specs: std });
                }}
                options={[{ value: 'satcom', label: 'SATCOM' }, { value: 'radio', label: 'Radio' }]} />
            </div>
            <SHFTextField label="Nomenclature" value={draft.nomenclature}
              onChange={v => onPatch({ nomenclature: v, ...(isNew && { id: slugify(v) || draft.id }) })} placeholder="Paradigm Hornet" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
              <SHFTextField label="Nickname" value={draft.nickname}
                onChange={v => onPatch({ nickname: v })} placeholder="Hornet" />
              <SHFTextField label="Manufacturer" value={draft.make}
                onChange={v => onPatch({ make: v })} placeholder="Paradigm" />
            </div>
            <SHFTextField label="One-Liner" value={draft.one_liner}
              onChange={v => onPatch({ one_liner: v })}
              placeholder="Briefing-style one-sentence summary." multiline rows={2} />
            <SHFTextField label="Document Number" value={draft.doc_number}
              onChange={v => onPatch({ doc_number: v })}
              placeholder={draft.terminal_type === 'radio' ? 'SIG-RTO-ASSET' : 'SIG-SAT-ASSET'} />
            <SHFMultiCheck label="Operational Mode" value={draft.operational_mode}
              onChange={v => onPatch({ operational_mode: v })} options={OPMODE_OPTS} />
          </EditorFormSection>

          {/* PHOTO */}
          <EditorFormSection eyebrow="Section 02" title="Photo">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handlePhotoFile}
            />

            {isNew ? (
              <div style={{
                padding: '10px 12px', border: '1px dashed var(--shf-graphite-600)',
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--shf-graphite-400)',
                letterSpacing: '0.06em', lineHeight: 1.5,
              }}>
                Save the record first, then upload a photo.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {draft.photo_url ? (
                  <EquipmentPhoto
                    equipmentId={draft.id}
                    photoUrl={draft.photo_url}
                    alt="equipment"
                    style={{ height: 80, width: 80, background: '#fff', padding: 4, objectFit: 'contain', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{
                    height: 80, width: 80, flexShrink: 0,
                    border: '1px dashed var(--shf-graphite-600)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--shf-graphite-500)',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>No Photo</div>
                )}
                {/* The photo above stays visible to anyone who reaches this
                    pane - looking at it is a read. Only the upload control is
                    gated, and it gates on the prop rather than on the parent
                    having already refused: this block is the last place in the
                    app carrying the shape the earlier WaveformLibraryPane fix
                    named, where a control is safe only because of where it
                    happens to be mounted. */}
                {canEdit && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadMutation.isPending}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                      background: 'var(--shf-amber)', color: 'var(--shf-black)',
                      border: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
                      letterSpacing: '0.14em', textTransform: 'uppercase', borderRadius: 2,
                      cursor: uploadMutation.isPending ? 'not-allowed' : 'pointer',
                      opacity: uploadMutation.isPending ? 0.6 : 1,
                    }}
                  >
                    {uploadMutation.isPending ? 'Uploading…' : draft.photo_url ? 'Replace Photo' : 'Upload Photo'}
                  </button>
                  {uploadMutation.isError && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#D43A2F', letterSpacing: '0.06em' }}>
                      {uploadMutation.error instanceof Error ? uploadMutation.error.message : 'Upload failed'}
                    </div>
                  )}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--shf-graphite-500)', letterSpacing: '0.06em' }}>
                    JPEG · PNG · WebP
                  </div>
                </div>
                )}
              </div>
            )}
          </EditorFormSection>

          {/* SERVICES (SATCOM) or WAVEFORMS (Radio) */}
          {isSatcom ? (
            <EditorFormSection eyebrow="Section 03" title="Services Available">
              {/* Chips choose which services this terminal offers; the rows
                  below carry the rates, which differ terminal to terminal even
                  for the same service. */}
              {globalServices.length === 0 && orphanServices.length === 0 ? (
                // An unreachable library must not be reported as an empty one:
                // the first is worth retrying, the second is worth filling in.
                // Hand entry works either way, which is why this is a note
                // rather than a blocking error.
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: servicesUnavailable ? 'var(--shf-amber-deep)' : 'var(--shf-graphite-400)', fontStyle: 'italic', marginBottom: 10 }}>
                  {servicesUnavailable ? (
                    <>
                      Could not load the Service Library, so its chips are unavailable. Reload to
                      try again, or enter a service by hand below.
                    </>
                  ) : (
                    <>
                      No services in the library yet - open the Comms Library in the sidebar to
                      add some, or enter one by hand below.
                    </>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {globalServices.map(lib => {
                    const active = selectedServices.has(normAbbrev(lib.abbrev));
                    return (
                      <button
                        key={lib.id}
                        type="button"
                        title={lib.name || lib.abbrev}
                        onClick={() => {
                          if (active) {
                            commitServices(draft.services.filter(s => normAbbrev(s.abbrev) !== normAbbrev(lib.abbrev)));
                          } else {
                            onPatch({ services: [...draft.services, { abbrev: lib.abbrev, name: lib.name, description: lib.description }] });
                          }
                        }}
                        style={{
                          padding: '5px 10px',
                          fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11,
                          letterSpacing: '0.12em', textTransform: 'uppercase',
                          border: `1px solid ${active ? 'var(--shf-amber)' : 'var(--shf-graphite-600)'}`,
                          background: active ? 'var(--shf-amber)' : 'transparent',
                          color: active ? 'var(--shf-black)' : 'var(--shf-paper)',
                          borderRadius: 2, cursor: 'pointer',
                        }}
                      >{lib.abbrev}</button>
                    );
                  })}
                  {/* Entries not in the library: an older record's service, or
                      one typed in below. Removable, never silently dropped. */}
                  {orphanServices.map((svc, i) => (
                    <button
                      key={`${svc.abbrev}-${i}`}
                      type="button"
                      title="Not in service library - click to remove"
                      onClick={() => commitServices(draft.services.filter(s => normAbbrev(s.abbrev) !== normAbbrev(svc.abbrev)))}
                      style={{
                        padding: '5px 10px',
                        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11,
                        letterSpacing: '0.12em', textTransform: 'uppercase',
                        border: '1px solid var(--shf-graphite-600)',
                        background: 'var(--shf-graphite-700)',
                        color: 'var(--shf-graphite-400)',
                        borderRadius: 2, cursor: 'pointer',
                      }}
                    >{svc.abbrev || 'untitled'} ✕</button>
                  ))}
                </div>
              )}
              {/* Add Service stays, even though the chips are the normal route.
                  Chip-only made the Service Library a hard dependency: with
                  /services failing or the library empty, a SATCOM terminal's
                  services could not be entered at all. The ▲/▼ order is still
                  the row order on the datasheet. */}
              <SHFRowList<EquipmentService>
                items={draft.services}
                onChange={commitServices}
                newItem={() => ({ abbrev: '', name: '', description: '' })}
                addLabel="Add Service"
                emptyMsg="No services selected."
                render={(svc, update) => {
                  // Abbrev and name belong to the library, so a row the library
                  // owns reads them rather than editing them. A hand-entered row
                  // has nowhere else to get them, so it keeps the inputs.
                  const fromLibrary = serviceLibraryAbbrevs.has(normAbbrev(svc.abbrev));
                  return (
                    <div>
                      {fromLibrary ? (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--shf-amber-deep)' }}>
                            {svc.abbrev}
                          </span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--shf-paper)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {svc.name || EMPTY_VALUE}
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0 12px' }}>
                          <SHFTextField label="Abbrev" value={svc.abbrev} onChange={v => update({ abbrev: v })} placeholder="GX" />
                          <SHFTextField label="Full Name" value={svc.name} onChange={v => update({ name: v })} placeholder="Inmarsat Global Express" />
                        </div>
                      )}
                      <SHFTextField label="Description" value={svc.description} onChange={v => update({ description: v })} multiline rows={2} />
                      {/* Best effort means no committed rate, and the flag alone is
                          enough to say so: the rate fields below disable while it is
                          set, and the datasheet renders "best effort" in place of any
                          figures (HeroBlock). So the numbers are kept rather than
                          cleared - unticking restores what was typed instead of
                          having silently destroyed it on a misclick. */}
                      <SHFCheckbox
                        label="Best Effort (no committed CIR/MIR)"
                        value={svc.best_effort ?? false}
                        onChange={v => update({ best_effort: v })}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 10px' }}>
                        <SHFNumberField label="CIR DL" unit="Mbps" disabled={svc.best_effort} value={svc.cir?.dl} onChange={v => update({ cir: { ...(svc.cir ?? {}), dl: v ?? undefined } })} />
                        <SHFNumberField label="CIR UL" unit="Mbps" disabled={svc.best_effort} value={svc.cir?.ul} onChange={v => update({ cir: { ...(svc.cir ?? {}), ul: v ?? undefined } })} />
                        <SHFNumberField label="MIR DL" unit="Mbps" disabled={svc.best_effort} value={svc.mir?.dl} onChange={v => update({ mir: { ...(svc.mir ?? {}), dl: v ?? undefined } })} />
                        <SHFNumberField label="MIR UL" unit="Mbps" disabled={svc.best_effort} value={svc.mir?.ul} onChange={v => update({ mir: { ...(svc.mir ?? {}), ul: v ?? undefined } })} />
                      </div>
                    </div>
                  );
                }}
              />
            </EditorFormSection>
          ) : (
            <>
              <EditorFormSection eyebrow="Section 03" title="Waveforms">
                {(() => {
                  const libraryAbbrevs = new Set(globalWaveforms.map(w => w.abbrev));
                  const orphans = draft.waveforms.filter(w => !libraryAbbrevs.has(w.abbrev));
                  return (
                    <>
                      {globalWaveforms.length === 0 && orphans.length === 0 ? (
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--shf-graphite-400)', fontStyle: 'italic' }}>
                          No waveforms in the library yet. Open the Comms Library in the sidebar to add some.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {globalWaveforms.map(wf => {
                            const active = draft.waveforms.some(w => w.abbrev === wf.abbrev);
                            return (
                              <button
                                key={wf.abbrev}
                                type="button"
                                title={wf.name || wf.abbrev}
                                onClick={() => {
                                  if (active) {
                                    onPatch({ waveforms: draft.waveforms.filter(w => w.abbrev !== wf.abbrev) });
                                  } else {
                                    onPatch({ waveforms: [...draft.waveforms, { abbrev: wf.abbrev, name: wf.name, description: wf.description }] });
                                  }
                                }}
                                style={{
                                  padding: '5px 10px',
                                  fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11,
                                  letterSpacing: '0.12em', textTransform: 'uppercase',
                                  border: `1px solid ${active ? 'var(--shf-amber)' : 'var(--shf-graphite-600)'}`,
                                  background: active ? 'var(--shf-amber)' : 'transparent',
                                  color: active ? 'var(--shf-black)' : 'var(--shf-paper)',
                                  borderRadius: 2, cursor: 'pointer',
                                }}
                              >{wf.abbrev}</button>
                            );
                          })}
                          {/* Orphaned entries not in the library - show as removable */}
                          {orphans.map(wf => (
                            <button
                              key={wf.abbrev}
                              type="button"
                              title="Not in waveform library. Click to remove"
                              onClick={() => onPatch({ waveforms: draft.waveforms.filter(w => w.abbrev !== wf.abbrev) })}
                              style={{
                                padding: '5px 10px',
                                fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11,
                                letterSpacing: '0.12em', textTransform: 'uppercase',
                                border: '1px solid var(--shf-graphite-600)',
                                background: 'var(--shf-graphite-700)',
                                color: 'var(--shf-graphite-400)',
                                borderRadius: 2, cursor: 'pointer',
                              }}
                            >{wf.abbrev} ✕</button>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </EditorFormSection>

              <EditorFormSection eyebrow="Section 03b" title="Waveform Compatibility">
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--shf-graphite-300)', marginBottom: 10, marginTop: 0, fontStyle: 'italic' }}>
                  Select radios from the inventory to compare waveform overlap. The compatibility matrix is built from these selections.
                </p>
                {inventoryRadios.length === 0 ? (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--shf-graphite-400)', fontStyle: 'italic' }}>
                    No other radios in the inventory yet.
                  </div>
                ) : (
                  <>
                    {/* Radio selection chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                      {inventoryRadios.map(eq => {
                        const active = draft.compat_comparisons.some(c => c.equipment_id === eq.id);
                        return (
                          <button
                            key={eq.id}
                            type="button"
                            title={eq.nickname ?? eq.nomenclature}
                            onClick={() => {
                              if (active) {
                                onPatch({ compat_comparisons: draft.compat_comparisons.filter(c => c.equipment_id !== eq.id) });
                              } else {
                                onPatch({
                                  compat_comparisons: [...draft.compat_comparisons, {
                                    equipment_id: eq.id,
                                    nomenclature: eq.nomenclature,
                                    nickname: eq.nickname ?? '',
                                    waveforms: (eq.data?.waveforms ?? []).map(w => w.abbrev),
                                  }],
                                });
                              }
                            }}
                            style={{
                              padding: '5px 10px',
                              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11,
                              letterSpacing: '0.12em', textTransform: 'uppercase',
                              border: `1px solid ${active ? 'var(--shf-amber)' : 'var(--shf-graphite-600)'}`,
                              background: active ? 'var(--shf-amber)' : 'transparent',
                              color: active ? 'var(--shf-black)' : 'var(--shf-paper)',
                              borderRadius: 2, cursor: 'pointer',
                            }}
                          >{eq.nomenclature}</button>
                        );
                      })}
                    </div>

                    {/* Waveform toggles for each selected radio */}
                    {draft.compat_comparisons.map(c => (
                      <CompatibilityEntryEditor
                        key={c.equipment_id ?? c.nomenclature}
                        comparison={c}
                        availableWaveforms={globalWaveforms}
                        onUpdate={patch => onPatch({
                          compat_comparisons: draft.compat_comparisons.map(x =>
                            x.equipment_id === c.equipment_id ? { ...x, ...patch } : x,
                          ),
                        })}
                      />
                    ))}
                  </>
                )}
              </EditorFormSection>
            </>
          )}

          {/* STANDARD SPECS */}
          <EditorFormSection eyebrow="Section 04" title="Standard Specs">
            {isSatcom ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
                  <SHFTextField label="Antenna Type" value={ss.antennaType as string} onChange={v => setSpec('antennaType', v)} placeholder="Parabolic" />
                  <SHFTextField label="Reflector"    value={ss.reflector    as string} onChange={v => setSpec('reflector', v)}    placeholder="1m dish" />
                  <SHFTextField label="Modem"        value={ss.modem        as string} onChange={v => setSpec('modem', v)}        placeholder="iDirect 950" />
                  <SHFSelectField label="Orbit" value={ss.orbit as string}
                    onChange={v => setSpec('orbit', v)} options={ORBIT_OPTS} />
                  <SHFNumberField label="BUC TX Power" unit="W"   value={ss.bucTransmitPower as number} onChange={v => setSpec('bucTransmitPower', v)} />
                  <SHFNumberField label="Wind Tolerance" unit="mph" value={ss.windTolerance as number}   onChange={v => setSpec('windTolerance', v)} />
                </div>
                <SHFCheckbox label="ALT-PNT Available" value={ss.altPntAvailable as boolean} onChange={v => setSpec('altPntAvailable', v)} />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
                <SHFTextField label="Antenna Type"     value={ss.antennaType   as string} onChange={v => setSpec('antennaType', v)}   placeholder="Whip antenna" />
                <SHFNumberField label="Transmit Power" unit="W" value={ss.transmitPower as number} onChange={v => setSpec('transmitPower', v)} />
                <SHFTextField label="Crypto"           value={ss.crypto         as string} onChange={v => setSpec('crypto', v)}         placeholder="Type 1, AES-256" />
                <div style={rowSty}>
                  <label style={labelSty}>
                    Range
                    {(['mi', 'km'] as const).map((u) => {
                      const active = ((ss.range_unit as string) ?? 'mi') === u;
                      return (
                        <button key={u} type="button"
                          onClick={() => {
                            if (active) return;
                            const cur = ss.range as number | null | undefined;
                            setSpec('range', cur != null ? Math.round(u === 'km' ? cur * 1.60934 : cur / 1.60934) : cur);
                            setSpec('range_unit', u);
                          }}
                          style={{
                            marginLeft: u === 'mi' ? 8 : 2, padding: '0 5px', lineHeight: '16px',
                            fontSize: 10, fontFamily: 'var(--font-mono)', borderRadius: 3,
                            border: '1px solid', cursor: 'pointer',
                            background: active ? 'var(--shf-amber)' : 'transparent',
                            color: active ? '#000' : 'var(--shf-graphite-300)',
                            borderColor: active ? 'var(--shf-amber)' : 'var(--shf-graphite-600)',
                          }}
                        >{u}</button>
                      );
                    })}
                  </label>
                  <input type="number" step="any"
                    value={(ss.range as number) ?? ''}
                    placeholder={EMPTY_VALUE}
                    onChange={e => setSpec('range', e.target.value === '' ? null : Number(e.target.value))}
                    onFocus={onFocus} onBlur={onBlur}
                    style={{ ...inputSty, fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
              </div>
            )}
          </EditorFormSection>

          {/* SWAP */}
          <EditorFormSection eyebrow="Section 05" title="Size · Weight · Power">
            <label style={labelSty}>Size (inches)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 10px', marginBottom: 12 }}>
              <SHFNumberField label="Length" value={draft.swap?.size?.length} onChange={v => setSize({ length: v ?? undefined })} />
              <SHFNumberField label="Width"  value={draft.swap?.size?.width}  onChange={v => setSize({ width: v ?? undefined })} />
              <SHFNumberField label="Height" value={draft.swap?.size?.height} onChange={v => setSize({ height: v ?? undefined })} />
            </div>
            <SHFWeight swap={draft.swap ?? {}} setSwap={setSwap} />
            <SHFTextField label="Power" value={draft.swap?.power ?? ''} onChange={v => setSwap({ power: v })} placeholder="70 W avg · 100 W max" />
          </EditorFormSection>

          {/* FREQUENCIES */}
          <EditorFormSection eyebrow="Section 06" title="Frequencies">
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--shf-graphite-300)', marginBottom: 10, marginTop: 0, fontStyle: 'italic' }}>
              Only list bands the terminal uses; others auto-render N/A.
            </p>
            <SHFRowList<EquipmentBand>
              items={draft.bands}
              onChange={v => onPatch({ bands: v })}
              newItem={() => (isSatcom
                ? { band: bandOpts[0] ?? '', downlink: '', uplink: '' }
                : { band: bandOpts[0] ?? '', freq_unit: 'MHz' })}
              addLabel="Add Band" emptyMsg="No bands defined."
              render={(b, update) => (
                <div>
                  {isSatcom ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr', gap: '0 12px' }}>
                        <SHFSelectField label="Band" value={b.band} onChange={v => update({ band: v })} options={bandOpts} />
                        <SHFTextField label="RX (Downlink)" value={b.downlink} onChange={v => update({ downlink: v })} placeholder="19.7–20.2 GHz" />
                        <SHFTextField label="TX (Uplink)"   value={b.uplink}   onChange={v => update({ uplink: v })}   placeholder="29.5–30.0 GHz" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                        <SHFNumberField label="EIRP" unit="dBW"  value={b.eirp} onChange={v => update({ eirp: v ?? undefined })} />
                        <SHFNumberField label="G/T"  unit="dB/K" value={b.gt}   onChange={v => update({ gt: v ?? undefined })} />
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0 12px', alignItems: 'start' }}>
                      <SHFSelectField label="Band" value={b.band} onChange={v => update({ band: v })} options={bandOpts} />
                      <SHFFreqRange band={b} update={update} />
                    </div>
                  )}
                </div>
              )}
            />
          </EditorFormSection>

          {/* PHYSICAL SPECS */}
          <EditorFormSection eyebrow="Section 07" title="Additional Physical Specs" defaultOpen={false}>
            <SHFRowList<SpecRow>
              items={draft.physical_specs}
              onChange={v => onPatch({ physical_specs: v })}
              newItem={() => ({ label: '', value: '' })}
              addLabel="Add Row" emptyMsg="No additional physical specs."
              render={(row, update) => (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '0 12px' }}>
                  <SHFTextField label="Label" value={row.label} onChange={v => update({ label: v })} />
                  <SHFTextField label="Value" value={row.value} onChange={v => update({ value: v })} />
                </div>
              )}
            />
          </EditorFormSection>

          {/* RF SPECS */}
          <EditorFormSection eyebrow="Section 08" title="Additional RF Specs" defaultOpen={false}>
            <SHFRowList<SpecRow>
              items={draft.rf_specs}
              onChange={v => onPatch({ rf_specs: v })}
              newItem={() => ({ label: '', value: '' })}
              addLabel="Add Row" emptyMsg="No additional RF specs."
              render={(row, update) => (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '0 12px' }}>
                  <SHFTextField label="Label" value={row.label} onChange={v => update({ label: v })} placeholder="Polarization" />
                  <SHFTextField label="Value" value={row.value} onChange={v => update({ value: v })} placeholder="Linear / Circular" />
                </div>
              )}
            />
          </EditorFormSection>

          {/* FEATURES */}
          <EditorFormSection eyebrow="Section 09" title="Features">
            <SHFRowList<EquipmentFeature>
              items={draft.features}
              onChange={v => onPatch({ features: v })}
              newItem={() => ({ title: '', description: '' })}
              addLabel="Add Feature" emptyMsg="No features listed."
              render={(f, update) => (
                <div>
                  <SHFTextField label="Title" value={f.title} onChange={v => update({ title: v })} placeholder="Modem Partitioning" />
                  <SHFTextField label="Description" value={f.description} onChange={v => update({ description: v })} multiline rows={2} placeholder="What it does and why it matters." />
                </div>
              )}
            />
          </EditorFormSection>

          {/* ACCESSORIES */}
          {!isSatcom && (
            <EditorFormSection eyebrow="Section 09b" title="Recommended Accessories">
              <SHFTextField
                label="Common pairings (downleads, headsets, mounts, batteries, cases)"
                value={draft.accessories}
                onChange={v => onPatch({ accessories: v })}
                placeholder="Free-form. Leave blank to show placeholder on the sheet."
                multiline rows={4}
              />
            </EditorFormSection>
          )}

          {/* USE CASES */}
          <EditorFormSection eyebrow="Section 10" title="Use Cases">
            <SHFTextField
              label="Mission profiles, deployment scenarios, configurations"
              value={draft.use_cases}
              onChange={v => onPatch({ use_cases: v })}
              placeholder="Multi-line free-form text."
              multiline rows={5}
            />
          </EditorFormSection>
        </div>
      </div>
      {cropFile && (
        <PhotoCropModal
          file={cropFile}
          onConfirm={handleCropConfirm}
          onClose={() => setCropFile(null)}
        />
      )}
    </>
  );
}

// ─── Waveform compatibility entry editor ────────────────────────────────────
// Separate component so it can hold local state for the custom-abbreviation input.

interface CompatibilityEntryEditorProps {
  comparison: CompatibilityComparison;
  availableWaveforms: Waveform[];
  onUpdate: (patch: Partial<CompatibilityComparison>) => void;
}

function CompatibilityEntryEditor({ comparison, availableWaveforms, onUpdate }: CompatibilityEntryEditorProps) {
  const selected = new Set(comparison.waveforms ?? []);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onUpdate({ waveforms: [...next] });
  };

  return (
    <div style={{
      marginBottom: 12, padding: '10px 12px',
      background: 'var(--shf-graphite-800)',
      border: '1px solid var(--shf-graphite-700)', borderRadius: 2,
    }}>
      {/* Radio header */}
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--shf-amber)', marginBottom: 8,
      }}>
        {comparison.nomenclature}
        {comparison.nickname && (
          <span style={{ color: 'var(--shf-graphite-300)', fontWeight: 400, marginLeft: 8, fontSize: 10 }}>
            {comparison.nickname}
          </span>
        )}
      </div>

      {/* Waveform chips */}
      {availableWaveforms.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--shf-graphite-400)', fontStyle: 'italic' }}>
          Add waveforms in the Comms Library first; they'll appear here as toggles.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {availableWaveforms.map(wf => {
            const active = selected.has(wf.abbrev);
            return (
              <button key={wf.abbrev} type="button" onClick={() => toggle(wf.abbrev)} style={{
                padding: '4px 9px',
                fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                border: `1px solid ${active ? 'var(--shf-amber)' : 'var(--shf-graphite-600)'}`,
                background: active ? 'var(--shf-amber)' : 'transparent',
                color: active ? 'var(--shf-black)' : 'var(--shf-paper)',
                borderRadius: 2, cursor: 'pointer',
              }}>{wf.abbrev}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── Right pane: scaled preview ──────────────────────────────────────────────

function SheetPreviewPane({ draft }: { draft: EditorDraft }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [innerW, setInnerW] = useState(0);
  const [contentH, setContentH] = useState(1320);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth - 32;
      setInnerW(w);
      setScale(Math.min(1, w / 1024));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-measure content height after draft changes settle (100 ms debounce).
  // scrollHeight reflects actual rendered content now that minHeight is removed from DataSheet.
  useEffect(() => {
    const id = setTimeout(() => {
      const article = containerRef.current?.querySelector('article');
      if (article) setContentH(article.scrollHeight);
    }, 100);
    return () => clearTimeout(id);
  }, [draft]);

  const eq = draftToEquipment(draft);
  const sheetH = Math.ceil(contentH * scale + 40);
  // Push sheet to right edge; only has effect when scale=1 and pane is wider than 1024px
  const sheetLeft = Math.max(0, innerW - 1024 * scale);
  // Page boundary in article coordinates - moves with scale so the line tracks the true print clip point
  const pageBreakAt = Math.round(1056 / scale);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Scrollable sheet */}
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', background: '#1A1D20', padding: 16 }}>
        <div style={{ width: 1024, transform: `scale(${scale})`, transformOrigin: 'top left', height: sheetH, marginLeft: sheetLeft }}>
          <DataSheetView equipment={eq} showPageBreak pageBreakAt={pageBreakAt} elevated />
        </div>
      </div>

      {/* Page-break notice - below the preview, outside the sheet */}
      <div style={{
        flexShrink: 0,
        padding: '10px 20px',
        background: 'rgba(212, 58, 47, 0.1)',
        borderTop: '1px solid rgba(212, 58, 47, 0.35)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: '#D43A2F', fontSize: 16, lineHeight: 1 }}>⚠</span>
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 13,
          color: 'rgba(212, 58, 47, 0.9)', fontStyle: 'italic', lineHeight: 1.4,
        }}>
          Anything below the red line will cause the document to scale down to fit everything into a single page when printed.
        </span>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function CatalogEditorPage() {
  const { id: routeId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { canWrite, canWriteRadio } = useAuth();
  const { showToast } = useToast();

  // A radio-scoped writer (rto) starts a new record on the radio side, since
  // satcom is the one thing they cannot save.
  const newDraftType: TerminalType = canWrite ? 'satcom' : 'radio';

  const { data: existingData, isLoading: loadingExisting } = useEquipmentItem(routeId ?? '');

  const createMutation = useCreateEquipment();
  const updateMutation = useUpdateEquipment();
  const deleteMutation = useDeleteEquipment();

  const [draft, setDraft] = useState<EditorDraft>(() => blankDraft(canWrite ? 'satcom' : 'radio'));
  const [isNew, setIsNew] = useState(!routeId);
  const [activeId, setActiveId] = useState<string | null>(routeId ?? null);
  const [showPreview, setShowPreview] = useState(true);

  const { data: waveformsData } = useWaveforms();
  const globalWaveforms = waveformsData?.waveforms ?? [];
  const { data: servicesData, isError: servicesFailed } = useServices();
  const globalServices = servicesData?.services ?? [];

  // When route changes or existing data loads, hydrate draft
  useEffect(() => {
    if (routeId && existingData) {
      setDraft(equipmentToDraft(existingData));
      setIsNew(false);
      setActiveId(routeId);
    }
  }, [routeId, existingData]);

  const patch = useCallback((p: Partial<EditorDraft>) => setDraft(prev => ({ ...prev, ...p })), []);

  const handleSelectFromList = (id: string) => {
    void navigate(`/catalog/${id}/edit`);
  };

  const handleNew = (type: TerminalType) => {
    const blank = blankDraft(type);
    setDraft(blank);
    setIsNew(true);
    setActiveId(null);
    void navigate('/catalog/editor');
  };

  const handleSave = () => {
    if (hasInvalidBandRange(draft.bands)) {
      showToast('Min frequency must be ≤ max', { severity: 'error' });
      return;
    }
    if (isNew) {
      createMutation.mutate({
        id: draft.id,
        nomenclature: draft.nomenclature,
        nickname: draft.nickname || undefined,
        one_liner: draft.one_liner || undefined,
        doc_number: draft.doc_number || undefined,
        photo_url: draft.photo_url || undefined,
        make: draft.make || undefined,
        terminal_type: draft.terminal_type,
        operational_mode: draft.operational_mode,
        data: {
          services: draft.services,
          waveforms: draft.waveforms,
          compatibility: { comparisons: draft.compat_comparisons },
          bands: draft.bands,
          standard_specs: draft.standard_specs as EquipmentData['standard_specs'],
          physical_specs: draft.physical_specs,
          rf_specs: draft.rf_specs,
          swap: draft.swap,
          features: draft.features,
          accessories: draft.accessories || undefined,
          use_cases: draft.use_cases || undefined,
        },
      }, {
        onSuccess: (eq) => {
          showToast(`Created ${eq.nomenclature}`);
          setIsNew(false);
          setActiveId(eq.id);
          void navigate(`/catalog/${eq.id}/edit`, { replace: true });
        },
        onError: (err) => showToast(err.message, { severity: 'error' }),
      });
    } else {
      updateMutation.mutate({
        id: draft.id,
        data: {
          nomenclature: draft.nomenclature,
          nickname: draft.nickname || undefined,
          one_liner: draft.one_liner || undefined,
          doc_number: draft.doc_number || undefined,
          photo_url: draft.photo_url || undefined,
          make: draft.make || undefined,
          terminal_type: draft.terminal_type,
          operational_mode: draft.operational_mode,
          data: {
            services: draft.services,
            waveforms: draft.waveforms,
            compatibility: { comparisons: draft.compat_comparisons },
            bands: draft.bands,
            standard_specs: draft.standard_specs as EquipmentData['standard_specs'],
            physical_specs: draft.physical_specs,
            rf_specs: draft.rf_specs,
            swap: draft.swap,
            features: draft.features,
            accessories: draft.accessories || undefined,
            use_cases: draft.use_cases || undefined,
          },
        },
      }, {
        onSuccess: () => showToast('Saved'),
        onError: (err) => showToast(err.message, { severity: 'error' }),
      });
    }
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete "${draft.nomenclature}"? This cannot be undone.`)) return;
    deleteMutation.mutate(draft.id, {
      onSuccess: () => {
        showToast(`Deleted ${draft.nomenclature}`);
        void navigate('/catalog/editor');
        setDraft(blankDraft(newDraftType));
        setIsNew(true);
        setActiveId(null);
      },
      onError: (err) => showToast(err.message, { severity: 'error' }),
    });
  };

  const handleDuplicate = () => {
    const copy = { ...draft, id: draft.id + '-copy', nomenclature: draft.nomenclature + ' (Copy)' };
    setDraft(copy);
    setIsNew(true);
    setActiveId(null);
    void navigate('/catalog/editor');
  };

  // Gated on the draft, not just the user: an rto writer may edit radio
  // records but not satcom ones, and the two share this editor. The backend
  // enforces the same rule per-record, so this only avoids a doomed round trip.
  const canEditDraft = canWrite || (canWriteRadio && draft.terminal_type === 'radio');

  if (!canEditDraft) {
    return (
      <MainLayout>
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography sx={{
            color: 'text.secondary'
          }}>
            {canWriteRadio
              ? 'Your role can only edit radio equipment. This is a SATCOM record.'
              : "You don't have permission to edit equipment."}
          </Typography>
          <Button sx={{ mt: 2 }} onClick={() => navigate('/catalog')}>Back to Catalog</Button>
        </Box>
      </MainLayout>
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const bandRangeInvalid = hasInvalidBandRange(draft.bands);

  return (
    <MainLayout>
      {/* Editor topbar */}
      <PageBanner sx={{ flexShrink: 0 }}>
        {/* pl 3.5: the title starts on the 28px line the browse, compare and
            library titles start on, so the word EQUIPMENT holds still across
            the catalog pages. */}
        <RailTitle width={CATALOG_RAIL_W}>Equipment Editor</RailTitle>
        {/* The way out sits after the rule, white like every other back button
            in the catalog ("← Catalog" on the sheet page): the white outline is
            navigation, the amber outline is an action on the record. No record
            caption here - the ID field a few lines below already says it. */}
        <Button
          startIcon={<ArrowBackIcon sx={{ fontSize: 14 }} />}
          onClick={() => void navigate('/catalog')}
          size="small"
          variant="outlined"
          sx={BANNER_BTN_PAPER_SX}
        >
          All Equipment
        </Button>
        {/* Right cluster, ending on the 28px line every other page's actions
            end on: the banner pads 20, hence mr 1. */}
        <Box sx={{ ml: 'auto', mr: 1, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2 }}>
        {!isNew && (
          <Tooltip title="View sheet">
            <Button
              size="small" startIcon={<OpenInNewIcon />}
              onClick={() => window.open(`/catalog/${draft.id}`, '_blank')}
              sx={BANNER_BTN_PAPER_SX}
              variant="outlined"
            >
              View Sheet
            </Button>
          </Tooltip>
        )}

        {/* The record's actions, moved up from a toolbar of their own inside
            the form pane. Duplicate and Delete only for a stored record; Save
            reads Create until then. The preview button toggles in place, so
            it never jumps rows when the preview opens or closes - which is
            why the preview pane no longer carries a Hide button of its own. */}
        {!isNew && (
          <>
            <Tooltip title="Duplicate">
              <Button variant="outlined" onClick={handleDuplicate} sx={{ ...BANNER_BTN_PAPER_SX, ...BANNER_ICON_BTN_SX }}>
                <ContentCopyIcon sx={{ fontSize: 16 }} />
              </Button>
            </Tooltip>
            <Tooltip title="Delete">
              <Button
                variant="outlined"
                onClick={handleDelete}
                sx={{ ...BANNER_BTN_PAPER_SX, ...BANNER_ICON_BTN_SX, color: 'var(--shf-error)', borderColor: 'rgba(248,81,73,0.4)', '&:hover': { borderColor: 'var(--shf-error)', background: 'rgba(248,81,73,0.08)' } }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </Button>
            </Tooltip>
          </>
        )}
        {/* The hint sits on a wrapping span, not the button: MUI puts
            pointer-events: none on a disabled ButtonBase, so a title there
            never shows, and disabled is the only time the hint applies. */}
        <span title={bandRangeInvalid ? 'A band has min frequency greater than max' : undefined} style={{ display: 'inline-flex' }}>
          <Button
            variant="contained"
            disableElevation
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={isSaving || bandRangeInvalid}
            sx={BANNER_BTN_PRIMARY_SX}
          >
            {isNew ? 'Create' : 'Save'}
          </Button>
        </span>
        <Tooltip title={showPreview ? 'Hide preview' : 'Show preview'}>
          <Button
            variant={showPreview ? 'outlined' : 'contained'}
            disableElevation
            startIcon={showPreview ? <VisibilityOffIcon /> : <VisibilityIcon />}
            onClick={() => { setShowPreview(v => !v); }}
            aria-pressed={showPreview}
            sx={showPreview ? BANNER_BTN_AMBER_SX : BANNER_BTN_PRIMARY_SX}
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
        </Tooltip>
        </Box>

        {/* No New SATCOM / New Radio here. The list rail already carries
            + SATCOM and + RADIO, and two ways to start a record in one screen
            is one too many. (They used to sit beneath three ⊞ library links,
            which moved out to /catalog/comms-library.) */}
      </PageBanner>

      {/* 3-pane grid */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: showPreview ? `${String(CATALOG_RAIL_W)}px 1fr 800px` : `${String(CATALOG_RAIL_W)}px 1fr`,
        height: `calc(100vh - ${String(EDITOR_CHROME_H)}px)`,
        overflow: 'hidden',
        // Cancel MainLayout's gutter, the same way catalog-page and
        // catalog-compare-page cancel it for their panels. Without this the
        // list rail floats 24px off the app sidebar and the preview stops 24px
        // short of the right edge - this was the one catalog surface that never
        // did it. No `mt`: PageBanner above has already cancelled the top.
        mx: -CONTENT_GUTTER,
        mb: -CONTENT_GUTTER,
      }}>
        <EquipmentListPane
          activeId={activeId}
          onSelect={handleSelectFromList}
          onNew={handleNew}
        />

        {loadingExisting && routeId ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--shf-graphite-700)' }}>
            <CircularProgress sx={{ color: 'var(--shf-amber)' }} />
          </Box>
        ) : (
          <EquipmentFormPane
            draft={draft}
            isNew={isNew}
            globalWaveforms={globalWaveforms}
            globalServices={globalServices}
            servicesUnavailable={servicesFailed}
            onPatch={patch}
            canEdit={canEditDraft}
          />
        )}

        {showPreview && <SheetPreviewPane draft={draft} />}
      </Box>
    </MainLayout>
  );
}
