import { useId, useState } from 'react';
import type { CSSProperties } from 'react';

import Check from '@mui/icons-material/Check';
import ExpandMore from '@mui/icons-material/ExpandMore';

import { chipToggleSty } from '@/components/catalog/chip-styles';
import { transportKindLabel } from '@/types';
import type { Transport } from '@/types';
import { PickerSearch } from './picker-search';
import { brightLabelSty, missingChipSty, noteSty, stripSty, transportLabel, WIZARD_INK, WIZARD_SOFT_INK } from './pick-strip-styles';

const headerBtnSty: CSSProperties = {
  ...brightLabelSty,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  padding: 0,
};

const captionSty: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 11, color: WIZARD_INK, fontWeight: 700 };

const countSty: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: WIZARD_INK, fontWeight: 700,
};

const listBoxSty: CSSProperties = {
  maxHeight: 260, overflowY: 'auto', border: '1px solid var(--shf-graphite-600)', borderRadius: 2, marginBottom: 8,
};

const rowSty = (on: boolean, hover: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 30, padding: '4px 10px',
  border: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--shf-paper)',
  fontFamily: 'var(--font-body)', fontSize: 13,
  background: hover ? 'var(--shf-graphite-800)' : on ? 'rgba(249,168,37,0.08)' : 'transparent',
});

const checkSty = (on: boolean): CSSProperties => ({
  width: 14, height: 14, flex: '0 0 14px', boxSizing: 'border-box', borderRadius: 2,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: `1px solid ${on ? 'var(--shf-amber)' : 'var(--shf-graphite-500)'}`,
  background: on ? 'var(--shf-amber)' : 'transparent',
});

const kindChipSty: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: WIZARD_INK, border: '1px solid var(--shf-graphite-500)', borderRadius: 2, padding: '0 5px', whiteSpace: 'nowrap',
};

const detailSty: CSSProperties = { fontSize: 12, color: WIZARD_SOFT_INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

const linkBtnSty: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  font: 'inherit',
  fontStyle: 'italic',
  color: 'inherit',
  textDecoration: 'underline',
  cursor: 'pointer',
};

/**
 * The transport library as toggle chips: the only direct pick left on a unit, since waveforms and services come from its assets.
 *
 * It collapses because a large library filled step 4 in one deployment and pushed everything else off screen.
 * Collapsed (the default) it shows only what is picked, as pressed chips that can still be switched off, under an "n picked of m" header.
 * Expanded it lists the whole library alphabetically in a scrolling box under step 3's search field, matching word by word across name, kind, provider, owner and country.
 * The full list keeps its role "group" and name "Transports", so callers and tests find it once expanded.
 */
export function TransportStrip({ transports, picked, onToggle, collapsible = true }: {
  transports: Transport[];
  picked: string[];
  onToggle: (id: string) => void;
  /** False opens the strip expanded with no collapse affordance, for a step that is only about transports. */
  collapsible?: boolean;
}) {
  const [expandedState, setExpanded] = useState(false);
  const expanded = !collapsible || expandedState;
  const [filter, setFilter] = useState('');
  const listId = useId();
  const ids = new Set(transports.map(t => t.id));
  const missing = picked.filter(id => !ids.has(id));
  const [hovered, setHovered] = useState<string | null>(null);
  const words = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (t: Transport) => {
    const hay = [t.name, transportKindLabel(t.kind), t.kind, t.provider, t.owned_by, t.owner_country, t.description].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  };
  const sorted = [...transports].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const listed = sorted.filter(t => picked.includes(t.id) || matches(t));
  const visible = transports.filter(t => picked.includes(t.id));

  const chip = (t: Transport) => {
    const on = picked.includes(t.id);
    return <button key={t.id} type="button" aria-pressed={on} onClick={() => { onToggle(t.id); }} style={chipToggleSty(on)}>{transportLabel(t)}</button>;
  };
  const row = (t: Transport) => {
    const on = picked.includes(t.id);
    const detail = [t.provider, t.owner_country].filter(Boolean).join(' \u00b7 ');
    const detailId = `${listId}-${t.id}`;
    return (
      <button
        key={t.id}
        type="button"
        aria-pressed={on}
        aria-label={transportLabel(t)}
        aria-describedby={detail ? detailId : undefined}
        onClick={() => { onToggle(t.id); }}
        onMouseEnter={() => { setHovered(t.id); }}
        onMouseLeave={() => { setHovered(h => (h === t.id ? null : h)); }}
        style={rowSty(on, hovered === t.id)}
      >
        <span aria-hidden="true" style={checkSty(on)}>
          {on && <Check style={{ fontSize: 12, color: 'var(--shf-black)' }} />}
        </span>
        <span aria-hidden="true">{t.name}</span>
        {t.kind && <span aria-hidden="true" style={kindChipSty}>{transportKindLabel(t.kind)}</span>}
        {detail && <span id={detailId} style={detailSty}>{detail}</span>}
      </button>
    );
  };
  const missingChips = missing.map(id => (
    <button key={'m-' + id} type="button" aria-pressed title="This transport no longer exists" onClick={() => { onToggle(id); }} style={missingChipSty}>missing record</button>
  ));

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {collapsible ? (
          <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => { setExpanded(e => !e); }} style={headerBtnSty}>
            <ExpandMore fontSize="small" style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 120ms' }} />
            <span>Transports</span>
          </button>
        ) : (
          <span style={brightLabelSty}>Transports</span>
        )}
        <span style={captionSty}>{`${picked.length} picked of ${transports.length}`}</span>
      </div>
      <div id={listId}>
        {expanded ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '6px 0' }}>
              <span style={countSty}>{`${listed.length} of ${transports.length}`}</span>
              <PickerSearch value={filter} onChange={setFilter} placeholder="Search by name, kind, provider, owner, country…" label="Search transports" />
            </div>
            <div role="group" aria-label="Transports" style={listBoxSty}>
              {transports.length === 0 && missing.length === 0 && <span style={{ ...noteSty, display: 'block', padding: '4px 10px' }}>The transport library is empty.</span>}
              {transports.length > 0 && listed.length === 0 && <span style={{ ...noteSty, display: 'block', padding: '4px 10px' }}>{`No transport matches "${filter.trim()}".`}</span>}
              {listed.map(row)}
            </div>
            {missing.length > 0 && <div style={stripSty}>{missingChips}</div>}
          </>
        ) : (
          <div role="group" aria-label="Picked transports" style={stripSty}>
            {transports.length === 0 && missing.length === 0 && <span style={noteSty}>The transport library is empty.</span>}
            {transports.length > 0 && picked.length === 0 && (
              <span style={noteSty}>
                {'None picked. '}
                <button type="button" onClick={() => { setExpanded(true); }} style={linkBtnSty}>{`Show all ${transports.length}`}</button>
                {' to add one.'}
              </span>
            )}
            {visible.map(chip)}
            {missingChips}
          </div>
        )}
      </div>
    </>
  );
}
