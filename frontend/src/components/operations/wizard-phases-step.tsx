import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, Tooltip } from '@mui/material';

import { BANNER_BTN_AMBER_SX, BANNER_BTN_PAPER_SX } from '@/components/common/banner-controls';
import { chipToggleSty } from '@/components/catalog/chip-styles';
import { errorMessage } from '@/services/api-client';
import { inputSty, onBlur, onFocus, selectSty } from '@/components/shf-form/styles';
import type { Participant, Site } from '@/types';
import { participantLabel } from './participant-label';
import { brightLabelSty, noteSty, WIZARD_INK } from './pick-strip-styles';
import { StatusIcon } from './status-icon';
import type { PhaseRow } from './use-phase-rows';

const selectStyle: CSSProperties = { ...inputSty, ...selectSty, fontSize: 12, width: 'auto', minWidth: 160 };

/** The select's last option, which opens the add field instead of choosing a site. */
const ADD_LOCATION = '__add-location__';
const SITE_NAME_MAX = 60;

/**
 * A new location typed on one phase's row, added to the operation's list at
 * once (it is the operation's, like the drawer's Locations list) and chosen
 * for that row. Blank, too long and a name already on the list are refused
 * here, before the round trip.
 */
function AddLocation({ sites, onAdd, onDone }: {
  sites: Site[];
  onAdd: (name: string) => Promise<void>;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Name the location.'); return; }
    if (sites.some((s) => s.name.trim().toLowerCase() === trimmed.toLowerCase())) { setError(`${trimmed} is already a location.`); return; }
    setBusy(true);
    setError('');
    onAdd(trimmed)
      .then(onDone)
      .catch((err: unknown) => { setError(errorMessage(err, 'Could not add the location.')); })
      .finally(() => { setBusy(false); });
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <input
        aria-label="New location name"
        autoFocus
        value={name}
        maxLength={SITE_NAME_MAX}
        placeholder="e.g. FSB North"
        onChange={(e) => { setName(e.target.value); setError(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') onDone(); }}
        style={{ ...inputSty, fontSize: 12, width: 180 }}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <Button size="small" variant="outlined" sx={BANNER_BTN_AMBER_SX} disabled={busy} onClick={submit}>Add</Button>
      <Button size="small" variant="outlined" sx={BANNER_BTN_PAPER_SX} disabled={busy} onClick={onDone}>Cancel</Button>
      {error && <span role="alert" style={{ ...noteSty, color: 'var(--shf-error)' }}>{error}</span>}
    </span>
  );
}

/** One Must talk to tile, chip and status slot together: wide enough for "RIVET JOINT" with its pip. */
const TALK_TILE_W = 170;

const monoCaptionSty: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: WIZARD_INK, fontWeight: 700, whiteSpace: 'nowrap' };

const phaseNameSty: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, letterSpacing: '0.04em',
  textTransform: 'uppercase', color: 'var(--shf-paper)', lineHeight: 1.2,
  // A fixed column, so every row's Location starts at the same x whatever the
  // phase is called; a long name wraps inside it (maintainer, 10-24).
  width: 220, flexShrink: 0, overflowWrap: 'anywhere',
};

const pipSty = (color: string): CSSProperties => ({
  display: 'block', width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
  background: color || 'transparent',
  border: color ? 0 : '1px solid var(--shf-graphite-600)',
});

/** The same card step 4 draws for an asset, with its left bar graphite; muted when the unit is not in the phase. */
function phaseCardSty(present: boolean): CSSProperties {
  return {
    background: 'var(--shf-graphite-800)',
    borderLeft: '3px solid var(--shf-graphite-400)',
    padding: '8px 12px',
    opacity: present ? 1 : 0.6,
  };
}

/**
 * Step 5: one card per phase, in position order. Where this unit sits comes
 * from the operation's sites, and who it must talk to is one toggle per other
 * unit, with the pair's status beside each pressed one. A phase in which the
 * unit has no gear is muted and its controls disabled, since a location or a
 * requirement for a unit that is not there is not something to plan.
 */
export function PhasesStep({ loaded, rows, sites, others, noGear, onSite, onPartner, onAddSite }: {
  loaded: boolean;
  rows: PhaseRow[];
  sites: Site[];
  others: Participant[];
  /** No platform, equipment or transport is picked at all, so no phase can hold the unit yet. */
  noGear: boolean;
  onSite: (row: PhaseRow, site: string) => void;
  onPartner: (row: PhaseRow, partnerId: string) => void;
  /** Adds a location to the operation and resolves to its id; absent, the step offers no Add. */
  onAddSite?: (name: string) => Promise<string>;
}) {
  // The one row whose add field is open, by phase id.
  const [adding, setAdding] = useState<string | null>(null);
  if (!loaded) return <div style={noteSty}>Loading the operation's phases.</div>;
  if (rows.length === 0) return <div style={noteSty}>This operation has no phases. Add them in the operation's Edit drawer.</div>;

  return (
    <div role="list" aria-label="Phases" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row) => {
        const { phase, present, choice, statuses } = row;
        return (
          <div key={phase.id} role="listitem" style={phaseCardSty(present)}>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <span style={phaseNameSty}>{phase.name}</span>
              {onAddSite && present && adding === phase.id ? (
                <>
                  <span style={{ ...brightLabelSty, marginBottom: 0 }}>Location</span>
                  <AddLocation
                    sites={sites}
                    onAdd={async (name) => { onSite(row, await onAddSite(name)); }}
                    onDone={() => { setAdding(null); }}
                  />
                </>
              ) : sites.length === 0 ? (
                onAddSite && present ? (
                  <>
                    <span style={{ ...brightLabelSty, marginBottom: 0 }}>Location</span>
                    <Button size="small" variant="outlined" sx={BANNER_BTN_AMBER_SX} onClick={() => { setAdding(phase.id); }}>
                      Add location
                    </Button>
                  </>
                ) : (
                  <span style={noteSty}>Add locations in the operation's Edit drawer</span>
                )
              ) : (
                <>
                  <label htmlFor={`wizard-site-${phase.id}`} style={{ ...brightLabelSty, marginBottom: 0 }}>Location</label>
                  <select
                    id={`wizard-site-${phase.id}`}
                    aria-label={`Location in ${phase.name}`}
                    value={sites.some((s) => s.id === choice.site) ? choice.site : ''}
                    disabled={!present}
                    onChange={(e) => {
                      if (e.target.value === ADD_LOCATION) { setAdding(phase.id); return; }
                      onSite(row, e.target.value);
                    }}
                    style={selectStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">No location</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    {onAddSite && <option value={ADD_LOCATION}>+ Add location...</option>}
                  </select>
                </>
              )}
              {!present && (
                <span style={noteSty}>
                  {noGear
                    ? 'Not in this phase - no gear picked yet in steps 2 to 5'
                    : 'Not in this phase - no gear marked for it in steps 4 and 5'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              <span style={monoCaptionSty}>Must talk to:</span>
              {others.length === 0 && <span style={noteSty}>No other units on this operation yet.</span>}
              {/* A grid of equal tiles, so the chips line up in columns from phase to phase
                  whatever the units are called (maintainer, 10-24). */}
              <div role="group" aria-label={`Must talk to in ${phase.name}`} style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, ${String(TALK_TILE_W)}px)`, alignItems: 'center', gap: '6px 14px', flex: 1, minWidth: 0 }}>
                {others.map((o) => {
                  const on = choice.partners.includes(o.id);
                  const status = on ? statuses.get(o.id) : undefined;
                  return (
                    <Tooltip key={o.id} title={status ? status.detail : ''} describeChild enterDelay={200} placement="top">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`Must talk to ${participantLabel(o)} in ${phase.name}`}
                        disabled={!present}
                        onClick={() => { onPartner(row, o.id); }}
                        style={{ ...chipToggleSty(on, true), display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...(present ? {} : { cursor: 'default' }) }}
                      >
                        <span style={pipSty(o.organization.color)} />
                        {participantLabel(o)}
                      </button>
                      {/* Fixed-width slot, see StatusIcon for why it is an icon; the tooltip is on the
                          whole chip because a 14px hover target was missed. */}
                      <StatusIcon kind={status ? status.kind : 'absent'} color={status ? status.color : 'transparent'} label={status ? status.detail : undefined} />
                    </span>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The review's Phases lines: per phase, where the unit sits and who it must
 * talk to with how each pair stands. A phase the unit is not in says so and
 * lists nothing, since nothing of it is saved.
 */
export function PhasesReview({ rows, sites, others }: { rows: PhaseRow[]; sites: Site[]; others: Participant[] }) {
  const labels = new Map(others.map((p) => [p.id, participantLabel(p)]));
  return (
    <>
      {rows.map(({ phase, present, choice, statuses }) => {
        if (!present) return <div key={phase.id}>{`${phase.name}: Not in this phase`}</div>;
        const site = sites.find((s) => s.id === choice.site);
        const talks = choice.partners.map((id) => {
          const status = statuses.get(id);
          return `${labels.get(id) ?? id}${status ? ` (${status.text})` : ''}`;
        });
        return (
          <div key={phase.id} style={{ marginBottom: 2 }}>
            <div>{`${phase.name}: ${site ? site.name : 'No location'}`}</div>
            {talks.length > 0 && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'rgba(244, 242, 236, 0.82)', marginTop: 2 }}>{`Must talk to ${talks.join(', ')}`}</div>
            )}
          </div>
        );
      })}
    </>
  );
}
