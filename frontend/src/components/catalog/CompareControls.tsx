import { useMemo } from 'react';
import type { Equipment } from '@/types';
import { compareNatural } from '@/utils';
import {
  COMPARE_GROUPS,
  GROUP_LABELS,
  GROUP_SHORT,
  type CompareGroup,
  type CompareParam,
  paramIsVisible,
} from './compare-params';
import { chipToggleSty, panelToggleSty } from './chip-styles';
import { ChipRow } from './chip-row';

interface CompareControlsProps {
  catalog: Equipment[];
  selectedIds: string[];
  available: CompareParam[];
  selectedParamIds: string[];
  /** Owned by the page, because the two toggles live up in the banner. */
  equipmentOpen: boolean;
  paramsOpen: boolean;
  onToggleEquipment: (id: string) => void;
  /** Bulk, because a loop over the single toggle cannot work. See the page. */
  onSetEquipment: (ids: string[], on: boolean) => void;
  onToggleParam: (id: string) => void;
  onSetGroup: (group: CompareGroup, on: boolean) => void;
}

interface CompareTogglesProps {
  /** Lets the page line the switches up with the heading's cap height. */
  style?: React.CSSProperties;
  equipmentCount: number;
  paramCount: number;
  equipmentOpen: boolean;
  paramsOpen: boolean;
  onToggleEquipmentPanel: () => void;
  onToggleParamsPanel: () => void;
}

/**
 * The two panel switches, rendered by the page beside the heading rather than
 * above the panels they open.
 *
 * Split out rather than kept with the panels so the open state has one owner.
 * A switch in the banner and a panel below it cannot both hold it.
 */
export function CompareToggles({
  style,
  equipmentCount,
  paramCount,
  equipmentOpen,
  paramsOpen,
  onToggleEquipmentPanel,
  onToggleParamsPanel,
}: CompareTogglesProps) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', ...style }}>
      <button type="button" onClick={onToggleEquipmentPanel} style={panelToggleSty(equipmentOpen)}>
        Equipment ({equipmentCount})
      </button>
      <button type="button" onClick={onToggleParamsPanel} style={panelToggleSty(paramsOpen)}>
        Parameters ({paramCount})
      </button>
    </div>
  );
}

/**
 * The two pickers, as collapsible panels above the matrix.
 *
 * Panels rather than a dialog: the selection is this page's URL state and the
 * matrix is its answer, so changing one column should not be a modal round
 * trip. The CSV controls are a dialog because they produce a file and then go
 * away, which is a different shape of task.
 *
 * The controls are toggle chips rather than the MUI checkboxes in
 * `common/csv/csv-checklist.tsx`, and the reason is checkable rather than
 * aesthetic: this surface is a hardcoded `--shf-graphite-900` on every route
 * under /catalog, while those checkboxes take their colour from the app
 * theme. Under the light theme they would render dark-on-dark here. Chips are
 * also the idiom Section 03 of the editor already uses for exactly this
 * "pick many from a library" job.
 */
export function CompareControls({
  catalog,
  selectedIds,
  available,
  selectedParamIds,
  equipmentOpen,
  paramsOpen,
  onToggleEquipment,
  onSetEquipment,
  onToggleParam,
  onSetGroup,
}: CompareControlsProps) {
  const selection = useMemo(
    () => selectedIds.map(id => catalog.find(eq => eq.id === id)).filter((eq): eq is Equipment => eq !== undefined),
    [selectedIds, catalog],
  );

  // SATCOM first, then radio, each alphabetical. The same ordering the browse
  // grid and the editor list use, so this is not a third answer.
  const satcom = useMemo(
    () => catalog.filter(eq => eq.terminal_type !== 'radio').sort((a, b) => compareNatural(a.nomenclature, b.nomenclature)),
    [catalog],
  );
  const radio = useMemo(
    () => catalog.filter(eq => eq.terminal_type === 'radio').sort((a, b) => compareNatural(a.nomenclature, b.nomenclature)),
    [catalog],
  );

  const chosen = new Set(selectedIds);
  const chosenParams = new Set(selectedParamIds);

  return (
    <div style={{ background: 'var(--shf-graphite-800)' }}>
      {equipmentOpen && (
        <div style={panelSty}>
          {/* No search field. The whole catalog is on screen as two short
              rows of chips, so a filter would only ever hide things the
              reader can already see. Add one back when the catalog outgrows
              the panel, not before. */}
          <EquipmentGroup label="SATCOM" items={satcom} chosen={chosen} onToggle={onToggleEquipment} onSetAll={onSetEquipment} />
          <EquipmentGroup label="Radio" items={radio} chosen={chosen} onToggle={onToggleEquipment} onSetAll={onSetEquipment} />
          {catalog.length === 0 && <p style={emptySty}>The catalog is empty.</p>}
        </div>
      )}

      {paramsOpen && (
        <div style={panelSty}>
          {COMPARE_GROUPS.map(group => {
            // A group whose every row is hidden by the current selection is
            // itself hidden. Offering a row the matrix has already decided not
            // to draw is worse than not offering it.
            const rows = available.filter(p => p.group === group && paramIsVisible(p, selection));
            if (rows.length === 0) return null;
            const allOn = rows.every(p => chosenParams.has(p.id));

            return (
              // No heading line above the chips. The equipment panel puts
              // its group name in the gutter beside them, and two panels
              // stacked on one surface should not use two layouts.
              <div key={group} style={{ marginBottom: 10 }}>
                {/* The gutter is reserved even on a band-less row, so every
                    chip lines up whichever group or panel it is in. */}
                {byBand(rows).map(({ band, params }, rowIndex) => (
                  <ChipRow
                    key={band ?? '_'}
                    // The group names its first row; later rows in the same
                    // group are the derived band rows and name themselves.
                    gutter={rowIndex === 0 ? GROUP_SHORT[group] : (band ?? '')}
                  >
                    {/* One ALL per group, on its first row, matching the
                        equipment panel. A Select all beside a Clear leaves
                        one of the pair inert at all times. */}
                    {rowIndex === 0 && (
                      <button
                        type="button"
                        aria-pressed={allOn}
                        aria-label={`All ${GROUP_LABELS[group]}`}
                        onClick={() => { onSetGroup(group, !allOn); }}
                        style={{ ...chipToggleSty(allOn), fontWeight: 700, letterSpacing: '0.1em' }}
                      >
                        ALL
                      </button>
                    )}
                    {params.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={chosenParams.has(p.id)}
                        onClick={() => { onToggleParam(p.id); }}
                        // The visible chip drops the band, since the gutter
                        // already carries it, but the accessible name keeps
                        // the full label: a bare "EIRP" is ambiguous read out
                        // of its row.
                        aria-label={p.label}
                        style={chipToggleSty(chosenParams.has(p.id))}
                      >
                        {band ? p.label.slice(band.length).trim() : p.label}
                      </button>
                    ))}
                  </ChipRow>
                ))}
              </div>
            );
          })}
          <p style={emptySty}>
            Additional physical and RF spec rows are free-typed per record, so they have no shared
            key to compare on and are not offered here yet.
          </p>
        </div>
      )}
    </div>
  );
}

function EquipmentGroup({
  label,
  items,
  chosen,
  onToggle,
  onSetAll,
}: {
  label: string;
  items: Equipment[];
  chosen: Set<string>;
  onToggle: (id: string) => void;
  onSetAll: (ids: string[], on: boolean) => void;
}) {
  if (items.length === 0) return null;
  const allOn = items.every(eq => chosen.has(eq.id));

  return (
    <ChipRow gutter={label}>
      {/* One tile doing both jobs rather than a Select all beside a Clear.
          The pair would leave one of them inert at all times, and this is a
          set that is either wholly in or not. */}
      <button
        type="button"
        aria-pressed={allOn}
        // Named for its group, as the parameter panel's ALL tiles already
        // are. Bare, the SATCOM and Radio tiles were two buttons called
        // "ALL" that a screen reader could not tell apart.
        aria-label={`All ${label}`}
        onClick={() => { onSetAll(items.map(eq => eq.id), !allOn); }}
        style={{ ...chipToggleSty(allOn), fontWeight: 700, letterSpacing: '0.1em' }}
      >
        ALL
      </button>
      {items.map(eq => (
        <button
          key={eq.id}
          type="button"
          aria-pressed={chosen.has(eq.id)}
          onClick={() => { onToggle(eq.id); }}
          title={eq.nickname ? `${eq.nomenclature} "${eq.nickname}"` : eq.nomenclature}
          style={chipToggleSty(chosen.has(eq.id))}
        >
          {eq.nomenclature}
        </button>
      ))}
    </ChipRow>
  );
}

const panelSty: React.CSSProperties = {
  padding: '14px 28px 18px',
  borderBottom: '1px solid var(--shf-graphite-700)',
};

/**
 * One line per band inside Frequencies, band-less parameters first.
 *
 * The derived rows are a cross product, so a single wrapped chip row put
 * "Ka EIRP" and "UHF TX Power" on the same line with nothing separating the
 * bands, and finding the one band you care about meant reading every chip.
 * Insertion order is preserved, which is already the natural band order
 * bandCompareParams emits.
 */
function byBand(params: CompareParam[]): { band?: string; params: CompareParam[] }[] {
  const groups = new Map<string, CompareParam[]>();
  for (const p of params) {
    const key = p.band ?? '';
    const bucket = groups.get(key);
    if (bucket) bucket.push(p);
    else groups.set(key, [p]);
  }
  return [...groups.entries()].map(([band, ps]) => ({ band: band || undefined, params: ps }));
}

const emptySty: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 12,
  fontStyle: 'italic',
  color: 'var(--shf-graphite-400)',
  margin: '4px 0 0',
  maxWidth: 620,
};


