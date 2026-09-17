import { useId, useState } from 'react';
import type { FacetModel, FacetTerm, PausedFacet } from './facet-selection';
import { CATALOG_RAIL_W } from './rail';
import { chipSty, chipToggleSty, panelToggleSty } from './chip-styles';
import { CONTENT_LINE } from '@/components/common/banner-controls';
import { HEADER_HEIGHT } from '@/components/layouts/main-layout';

/**
 * The browse page's filter column.
 *
 * Presentational only. It takes a `FacetModel[]` and calls back; it does not
 * know what a record is, does not read the URL, and holds no filtering rule of
 * its own. Every interesting decision - which values exist, what each count
 * means, whether a facet is worth drawing - is settled in `facet-selection.ts`
 * and unit-tested with nothing mounted.
 *
 * Controls are `<button aria-pressed>` chips, not MUI checkboxes. Every route
 * under /catalog is a hardcoded `--shf-graphite-900` while MUI controls take
 * their colour from the app theme, so a checkbox here renders dark-on-dark
 * under the light theme - the same reason `CompareControls` uses chips.
 */

interface FacetSidebarProps {
  models: FacetModel[];
  /**
   * Below `md` the column becomes a strip above the grid. A 240px rail beside
   * a 320px-minimum card grid leaves no room for a card at phone widths.
   */
  stacked?: boolean;
  /**
   * Terms this tab is APPLYING. Not the number of terms in the URL - a term
   * under a facet this tab does not admit is held and drawn below instead, and
   * counting it here is the bug an earlier fix closed.
   */
  appliedCount: number;
  /** Records the current filters leave, for the reset line. */
  shownCount: number;
  /** Terms held for another tab, named so they can be seen and dropped. */
  paused: PausedFacet[];
  onToggleValue: (facetId: string, key: string) => void;
  onToggleBlank: (facetId: string) => void;
  onSetRange: (facetId: string, min: number | null, max: number | null) => void;
  /** Clears only what `appliedCount` counted. */
  onClearAll: () => void;
  onClearTerm: (facetId: string, term: FacetTerm) => void;
  onClearPaused: () => void;
  /**
   * Which sections are open, and which have their value tail expanded.
   *
   * Owned by the page rather than by this component, because the rail
   * unmounts on the library tabs and local state went with it: open a
   * section, glance at Waveforms, come back, and it had closed again. Keyed by
   * facet id, never by index, so a facet that comes and goes with the tab
   * cannot inherit another facet's state.
   *
   * **Open, not collapsed.** Sections start closed, so the default is the
   * empty set - which needs no facet list and so cannot be caught by the
   * first render having no data. See the note on the page's `expandedFacets`.
   */
  expanded: ReadonlySet<string>;
  expandedTails: ReadonlySet<string>;
  onToggleCollapsed: (facetId: string) => void;
  onToggleTail: (facetId: string) => void;
  onSetAllExpanded: (facetIds: string[]) => void;
}

const headingSty: React.CSSProperties = {
  fontFamily: 'var(--font-condensed)',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--shf-paper)',
};

const noteSty: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 9.5,
  letterSpacing: '0.06em',
  color: 'var(--shf-graphite-400)',
};

const rowSty: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4 };

/**
 * Value chips and range presets: two equal columns. As a wrapping row each
 * chip was as wide as its label, so Services showed ragged rows of two and
 * three with nothing aligned. Two columns of the 208px content width give
 * 102px a chip and about 84px of text, which holds every band and service
 * code; a long manufacturer or waveform name ellipsises, with the full name
 * in `title` and in the accessible name. The paused block keeps the wrapping
 * row: its chips are compound "Facet: value ✕" labels.
 */
const gridSty: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 4 };

/** A chip filling its grid cell: label left and truncating, count pinned right. */
function gridChipSty(base: React.CSSProperties): React.CSSProperties {
  return { ...base, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, textAlign: 'left' };
}
// The three looks a grid chip can have, built once: the rail re-renders on
// every facet click, a manufacturer facet holds dozens of chips, and a fresh
// style object per chip per render is a fresh inline-style diff for each.
const GRID_CHIP_ON = gridChipSty(chipToggleSty(true));
const GRID_CHIP_OFF = gridChipSty(chipToggleSty(false));
const GRID_CHIP_OFF_EMPTY: React.CSSProperties = { ...GRID_CHIP_OFF, opacity: 0.4, cursor: 'default' };
/** A count of 0 stays visible and goes quiet rather than reflowing away. */
function gridChip(selected: boolean, count: number): React.CSSProperties {
  if (selected) return GRID_CHIP_ON;
  return count === 0 ? GRID_CHIP_OFF_EMPTY : GRID_CHIP_OFF;
}
const chipLabelSty: React.CSSProperties = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const chipCountSty: React.CSSProperties = { opacity: 0.65, flexShrink: 0 };

function scopeTag(scope: FacetModel['scope'] | null): string | null {
  if (scope === 'satcom') return 'SATCOM';
  if (scope === 'radio') return 'RADIO';
  return null;
}

/**
 * The terms this tab is holding but not applying.
 *
 * It lives in the header region rather than beside a facet because a paused
 * facet is, by construction, not drawn - there is no section to hang it on,
 * which is exactly why the reader previously had no way to see or remove it.
 *
 * Tone follows the "radios excluded (n)" line below: stated, not alarmed. It
 * says *held for* rather than *ignored* because the term comes back the moment
 * the reader switches tabs, and that is the whole reason it was kept.
 */
function PausedBlock({ paused, onClearTerm, onClearPaused }: {
  paused: PausedFacet[];
  onClearTerm: FacetSidebarProps['onClearTerm'];
  onClearPaused: FacetSidebarProps['onClearPaused'];
}) {
  const total = paused.reduce((n, facet) => n + facet.terms.length, 0);
  if (total === 0) return null;

  // Every paused facet on a given tab carries the opposite scope, since a tab
  // admits `both` plus its own - so one heading covers the block. The plural
  // wording is the fallback for a facet the registry does not know, which has
  // no scope to name.
  const tags = [...new Set(
    paused.map(facet => scopeTag(facet.scope)).filter((t): t is string => t !== null),
  )];
  const heading = tags.length === 1 ? `Held for the ${tags[0]} tab` : 'Held for another tab';

  return (
    <div style={{
      marginBottom: 14,
      paddingBottom: 12,
      borderBottom: '1px solid var(--shf-graphite-700)',
    }}>
      <div style={noteSty}>{heading} ({total})</div>
      <div style={{ ...rowSty, marginTop: 6 }}>
        {paused.flatMap(facet => facet.terms.map(({ term, label }) => (
          <button
            key={`${facet.facetId}:${label}`}
            type="button"
            // Prefixed, so it cannot be confused with a facet value chip, whose
            // accessible name is "{label}, {n} results".
            aria-label={`Clear paused filter, ${facet.label}: ${label}`}
            onClick={() => { onClearTerm(facet.facetId, term); }}
            style={{ ...chipToggleSty(false), opacity: 0.75 }}
          >
            {facet.label}: {label} <span aria-hidden="true">✕</span>
          </button>
        )))}
      </div>
      {total > 1 && (
        <button
          type="button"
          onClick={onClearPaused}
          style={{ ...panelToggleSty(false), padding: '2px 8px', fontSize: 9.5, marginTop: 8 }}
        >
          Clear paused ({total})
        </button>
      )}
    </div>
  );
}

function ValueChips({ model, onToggleValue, expanded, onToggleExpanded }: {
  model: FacetModel;
  onToggleValue: FacetSidebarProps['onToggleValue'];
  expanded: boolean;
  onToggleExpanded: (facetId: string) => void;
}) {
  const limit = model.facet.showFirst;
  // A selected value is never hidden in the tail, or a filter arriving from a
  // link would be impossible to find and turn off.
  const visible = expanded || limit == null
    ? model.values
    : model.values.filter((v, i) => i < limit || v.selected);
  const hidden = model.values.length - visible.length;

  return (
    <>
      <div style={gridSty}>
        {visible.map(v => (
          <button
            key={v.key}
            type="button"
            aria-pressed={v.selected}
            // The count has to be inside the accessible name, or a screen
            // reader announces "Ka 4" as two unrelated tokens.
            aria-label={`${v.label}, ${String(v.count)} results`}
            title={v.label}
            disabled={v.count === 0 && !v.selected}
            onClick={() => { onToggleValue(model.facet.id, v.key); }}
            style={gridChip(v.selected, v.count)}
          >
            <span style={chipLabelSty}>{v.label}</span>
            <span style={chipCountSty} aria-hidden="true">{v.count}</span>
          </button>
        ))}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => { onToggleExpanded(model.facet.id); }}
          style={{ ...noteSty, background: 'none', border: 'none', padding: '4px 0 0', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Show all ({model.values.length})
        </button>
      )}
      {expanded && limit != null && model.values.length > limit && (
        <button
          type="button"
          onClick={() => { onToggleExpanded(model.facet.id); }}
          style={{ ...noteSty, background: 'none', border: 'none', padding: '4px 0 0', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Show fewer
        </button>
      )}
    </>
  );
}

function RangeControl({ model, onSetRange }: {
  model: FacetModel;
  onSetRange: FacetSidebarProps['onSetRange'];
}) {
  const inputId = useId();
  // A custom entry that matches no preset; the presets own their own value.
  const custom = model.range && !model.presets.some(p => p.selected) ? model.range.max : null;
  /**
   * Keystrokes in progress, or `null` for "not being typed in - show the URL".
   *
   * Deliberately not `useState(String(custom))`. A `useState` initializer runs
   * once, on the first render, and on that render the equipment query has not
   * resolved: there are no models, so `custom` is null and the box seeds
   * empty and stays empty. Opening a link with `?f.weight=..45` then showed a
   * filter that was demonstrably working - the grid was narrowed - above a
   * blank box claiming no threshold was set. Same latch that made the rail
   * open on a narrow load, in a different control.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (custom == null ? '' : String(custom));
  /**
   * A committed custom threshold, not being edited. A selected preset
   * confirms itself with the amber chip; this box confirmed nothing once it
   * lost focus - the amber ring a reader saw was the global focus outline,
   * gone on blur, leaving a graphite box with a number in it. Amber here
   * means "this is what is filtering", so mid-edit goes back to neutral.
   */
  const applied = custom != null && draft == null;
  const appliedColor = applied ? 'var(--shf-amber)' : undefined;

  const commit = (raw: string) => {
    // Hand the field back to the URL either way, so a rejected entry snaps
    // back to what is actually filtering rather than sitting there looking set.
    setDraft(null);
    const trimmed = raw.trim();
    if (!trimmed) { onSetRange(model.facet.id, null, null); return; }
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) onSetRange(model.facet.id, null, n);
  };

  return (
    <>
      {model.presets.length > 0 && (
        <div style={gridSty}>
          {model.presets.map(p => (
            <button
              key={p.label}
              type="button"
              aria-pressed={p.selected}
              aria-label={`${p.label} ${model.unit ?? ''}, ${String(p.count)} results`}
              disabled={p.count === 0 && !p.selected}
              onClick={() => {
                if (p.selected) onSetRange(model.facet.id, null, null);
                else onSetRange(model.facet.id, p.min, p.max);
              }}
              style={gridChip(p.selected, p.count)}
            >
              <span style={chipLabelSty}>{p.label}</span>
              <span style={chipCountSty} aria-hidden="true">{p.count}</span>
            </button>
          ))}
        </div>
      )}
      {/* Without presets this is the only thing telling the reader what
          scale the box expects. Rounded, because it is orientation rather
          than a value anyone should type back in verbatim. */}
      {model.span != null && model.presets.length === 0 && (
        <div style={{ ...noteSty, marginTop: 2 }}>
          {Math.round(model.span.min)} – {Math.round(model.span.max)} {model.unit} in catalog
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        {/* A real label, not a placeholder: the placeholder disappears the
            moment anything is typed, which is when the unit matters most. */}
        <label htmlFor={inputId} style={{ ...noteSty, color: appliedColor ?? noteSty.color }}>Under</label>
        <input
          id={inputId}
          type="number"
          min={0}
          value={shown}
          onChange={e => { setDraft(e.target.value); }}
          onBlur={e => { commit(e.target.value); }}
          onKeyDown={e => { if (e.key === 'Enter') commit(e.currentTarget.value); }}
          style={{
            width: 64,
            padding: '3px 6px',
            background: 'var(--shf-graphite-900)',
            color: appliedColor ?? 'var(--shf-paper)',
            border: `1px solid ${appliedColor ?? 'var(--shf-graphite-600)'}`,
            borderRadius: 2,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
          }}
        />
        {/* The filtered value is normalized, so the unit is not decoration -
            a km range answers this control in miles. */}
        <span style={{ ...noteSty, color: appliedColor ?? noteSty.color }}>{model.unit}</span>
        {/* Clearing used to mean emptying the box and blurring; the same
            onSetRange(null, null) that commit('') reaches, one click away. */}
        {applied && (
          <button
            type="button"
            aria-label={`Clear custom threshold, ${model.label}`}
            onClick={() => { onSetRange(model.facet.id, null, null); }}
            style={{ ...chipSty('amber'), cursor: 'pointer', fontSize: 11, lineHeight: 1.2 }}
          >
            ✕
          </button>
        )}
      </div>
    </>
  );
}

function Facet({ model, collapsed, onToggleCollapsed, tailExpanded, onToggleTail, onToggleValue, onToggleBlank, onSetRange }: {
  model: FacetModel;
  collapsed: boolean;
  onToggleCollapsed: (facetId: string) => void;
  tailExpanded: boolean;
  onToggleTail: (facetId: string) => void;
  onToggleValue: FacetSidebarProps['onToggleValue'];
  onToggleBlank: FacetSidebarProps['onToggleBlank'];
  onSetRange: FacetSidebarProps['onSetRange'];
}) {
  const headingId = useId();
  const bodyId = useId();
  const tag = scopeTag(model.scope);

  return (
    <section role="group" aria-labelledby={headingId} style={{ marginBottom: collapsed ? 8 : 18 }}>
      <h3 style={{ margin: '0 0 6px' }}>
        {/*
          The whole header is the collapse/expand control rather than a small
          sign beside it. Eleven facets in a scrolling rail means this gets
          used often, and a 12px target used often is a bad target - the label
          is already there and already the thing being pointed at.
        */}
        <button
          type="button"
          id={headingId}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => { onToggleCollapsed(model.facet.id); }}
          style={{
            ...headingSty,
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            width: '100%',
            padding: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span
            aria-hidden="true"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--shf-amber)', width: 9 }}
          >
            {collapsed ? '+' : '−'}
          </span>
          {model.label}
          {model.unit != null && <span style={noteSty}>({model.unit})</span>}
          {/* A collapsed facet that is filtering has to say so on the header,
              or collapsing it would hide a working filter behind a plus sign -
              the same reason a one-answer facet is still drawn while active. */}
          {collapsed && model.activeCount > 0 && (
            <span style={{ ...noteSty, color: 'var(--shf-amber)' }}>{model.activeCount} on</span>
          )}
          {/* Says up front that this facet does not apply to everything on
              screen, so the exclusion below is a stated rule and not a surprise. */}
          {tag != null && <span style={{ ...noteSty, marginLeft: 'auto' }}>{tag}</span>}
        </button>
      </h3>

      <div id={bodyId} hidden={collapsed}>
        {model.facet.kind === 'range'
          ? <RangeControl model={model} onSetRange={onSetRange} />
          : <ValueChips model={model} onToggleValue={onToggleValue} expanded={tailExpanded} onToggleExpanded={onToggleTail} />}

        {/* The blank population, always shown and always counted. A range filter
            is a claim about a number and a record with none cannot satisfy it,
            so those records drop out - and a gap that drops out silently is a
            gap nobody ever closes. This line is both the disclosure and the way
            back in. */}
        {(model.blank.count > 0 || model.blank.selected) && (
          <button
            type="button"
            aria-pressed={model.blank.selected}
            aria-label={`Not specified, ${String(model.blank.count)} results`}
            onClick={() => { onToggleBlank(model.facet.id); }}
            style={{
              ...chipToggleSty(model.blank.selected),
              marginTop: 6,
              fontStyle: 'italic',
            }}
          >
            Not specified <span style={{ opacity: 0.65 }} aria-hidden="true">{model.blank.count}</span>
          </button>
        )}

        {/* Only ever non-zero on the All tab, where a scoped filter really does
            remove the other kind of equipment wholesale. */}
        {model.activeCount > 0 && model.naCount > 0 && (
          <div style={{ ...noteSty, marginTop: 4 }}>
            {model.scope === 'satcom' ? 'radios' : 'SATCOM terminals'} excluded ({model.naCount})
          </div>
        )}
      </div>
    </section>
  );
}

export function FacetSidebar({
  models,
  stacked = false,
  appliedCount,
  shownCount,
  paused,
  onToggleValue,
  onToggleBlank,
  onSetRange,
  onClearAll,
  onClearTerm,
  onClearPaused,
  expanded,
  expandedTails,
  onToggleCollapsed,
  onToggleTail,
  onSetAllExpanded,
}: FacetSidebarProps) {
  const allCollapsed = models.length > 0 && models.every(m => !expanded.has(m.facet.id));

  return (
    <aside
      aria-label="Filters"
      style={{
        padding: `14px ${String(CONTENT_LINE)}px 18px`,
        background: 'var(--shf-graphite-800)',
        ...(stacked
          ? { borderBottom: '1px solid var(--shf-graphite-700)' }
          : {
              flex: `0 0 ${String(CATALOG_RAIL_W)}px`,
              // The scroll container is #main-content, which is exactly
              // `100vh - HEADER_HEIGHT` tall, so pinning the rail to that
              // height makes it stick for real and gives it its own scrollbar.
              // Its first version used `maxHeight: 100%`, which resolves
              // against the flex row - as tall as the card grid - so the rail
              // was 1168px in a 656px viewport and simply scrolled away.
              // `alignSelf` matters too: the default `stretch` would defeat
              // sticky before `top` ever applied.
              alignSelf: 'flex-start',
              position: 'sticky',
              top: 0,
              height: `calc(100vh - ${String(HEADER_HEIGHT)}px)`,
              overflowY: 'auto',
              borderRight: '1px solid var(--shf-graphite-700)',
            }),
      }}
    >
      {/* Stacked, not in a row: at 12.5px "Collapse all" and "Clear (1)" both
          wrapped to two lines beside the heading in the 240px rail. No inset of
          its own: the rail now pads by the content line itself, so this block
          already starts where the Equipment Catalog title in the banner does. */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...headingSty, fontSize: 16, marginBottom: 8 }}>Filters</div>
        {models.length > 1 && (
          <button
            type="button"
            onClick={() => { onSetAllExpanded(allCollapsed ? models.map(m => m.facet.id) : []); }}
            style={{ ...panelToggleSty(false), padding: '2px 8px', fontSize: 12.5, whiteSpace: 'nowrap', display: 'block' }}
          >
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        {appliedCount > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            // Red, unlike its neighbour: it discards state rather than folding it.
            style={{ ...panelToggleSty(false), padding: '2px 8px', fontSize: 12.5, whiteSpace: 'nowrap', display: 'block', marginTop: 6, color: 'var(--shf-error)', border: '1px solid var(--shf-error)' }}
          >
            Clear ({appliedCount})
          </button>
        )}
      </div>

      <PausedBlock paused={paused} onClearTerm={onClearTerm} onClearPaused={onClearPaused} />

      {models.length === 0 ? (
        <div style={noteSty}>Nothing here varies enough to filter on.</div>
      ) : (
        <div style={stacked
          ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }
          : undefined}
        >
        {models.map(model => (
          <Facet
            key={model.facet.id}
            model={model}
            collapsed={!expanded.has(model.facet.id)}
            onToggleCollapsed={onToggleCollapsed}
            tailExpanded={expandedTails.has(model.facet.id)}
            onToggleTail={onToggleTail}
            onToggleValue={onToggleValue}
            onToggleBlank={onToggleBlank}
            onSetRange={onSetRange}
          />
        ))}
        </div>
      )}

      {appliedCount > 0 && (
        <div style={{ ...noteSty, borderTop: '1px solid var(--shf-graphite-700)', paddingTop: 10 }}>
          {shownCount} matching
        </div>
      )}
    </aside>
  );
}
