import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from '@mui/material';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';

import { BANNER_BTN_AMBER_SX, BANNER_BTN_PAPER_SX, BANNER_BTN_PRIMARY_SX } from '@/components/common/banner-controls';
import { inputSty, labelSty, onBlur, onFocus, selectSty } from '@/components/shf-form/styles';
import { useToast } from '@/contexts';
import { useSavePhasePlan } from '@/services';
import { errorMessage } from '@/services/api-client';
import type { Participant, Phase, Site } from '@/types';
import type { InteropColumn } from './interop-model';
import { normalisePair, planRequest } from './phase-plan-draft';
import type { PlanDraft } from './phase-plan-draft';
import { participantLabel } from './participant-label';
import { TIER_SELECT } from './phase-picture-model';

const selectStyle: CSSProperties = { ...inputSty, ...selectSty, fontSize: 12, padding: '5px 24px 5px 8px', minWidth: 0 };

const sectionSty: CSSProperties = { display: 'grid', gap: 6, marginBottom: 16 };

const noteSty: CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 12, fontStyle: 'italic', color: 'var(--shf-graphite-300)', lineHeight: 1.45,
};

const unitSty: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em',
  textTransform: 'uppercase', color: 'var(--shf-paper)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const removeSty: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, padding: 0, flexShrink: 0,
  background: 'transparent', border: '1px solid var(--shf-graphite-600)', color: 'var(--shf-paper)', cursor: 'pointer', borderRadius: 2,
};

/**
 * The planning column beside the phase picture, for writers: who the phase
 * supports, where each unit in it sits, and who must talk to whom, with one
 * Save for the phase and a Reset. It edits the draft it is given, so the
 * picture shows an edit before it is saved, and it knows nothing about the
 * route or the phase switch: those ask about a dirty draft from outside.
 *
 * Only units present in the phase can be picked, supported, placed or paired.
 * A stored placement or requirement naming a unit that is not present is left
 * alone and sent back unchanged, and a requirement row is listed (so it can be
 * removed) whoever it names.
 */
export function PhasePlanPanel({ operationId, phase, columns, participants, sites, draft, dirty, setDraft, onReset }: {
  operationId: string;
  phase: Phase;
  /** The units present in the phase. */
  columns: InteropColumn[];
  /** Every unit on the operation, to label a requirement whose unit is not in the phase. */
  participants: Participant[];
  sites: Site[];
  draft: PlanDraft;
  dirty: boolean;
  setDraft: (change: (d: PlanDraft) => PlanDraft) => void;
  onReset: () => void;
}) {
  const save = useSavePhasePlan();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');

  const labelOf = (id: string) => {
    const p = participants.find((x) => x.id === id);
    return p ? participantLabel(p) : id;
  };
  const present = new Set(columns.map((c) => c.participantId));
  const paired = (x: string, y: string) => draft.requirements.some((r) => (r.a === x && r.b === y) || (r.a === y && r.b === x));
  const partners = columns.filter((c) => c.participantId !== first && !(first !== '' && paired(first, c.participantId)));

  const setSupported = (id: string) => { setDraft((d) => ({ ...d, supported: id === '' ? null : id })); };
  const place = (unit: string, site: string) => {
    setDraft((d) => {
      const placements = { ...d.placements };
      if (site === '') delete placements[unit];
      else placements[unit] = site;
      return { ...d, placements };
    });
  };
  const addRequirement = () => {
    if (first === '' || second === '' || first === second || paired(first, second)) return;
    setDraft((d) => ({ ...d, requirements: [...d.requirements, normalisePair(first, second)] }));
    setFirst('');
    setSecond('');
  };
  const removeRequirement = (index: number) => {
    setDraft((d) => ({ ...d, requirements: d.requirements.filter((_, i) => i !== index) }));
  };

  const handleSave = () => {
    setError(null);
    save.mutate(
      { operationId, phaseId: phase.id, data: planRequest(draft) },
      {
        onSuccess: () => { showToast(`${phase.name} plan saved`); },
        onError: (err) => { setError(errorMessage(err, 'Failed to save the plan.')); },
      },
    );
  };

  return (
    <section
      aria-label={`Plan for ${phase.name}`}
      style={{ background: 'var(--shf-graphite-800)', border: '1px solid var(--shf-graphite-600)', borderTop: '3px solid var(--shf-amber)', padding: 14 }}
    >
      <div style={sectionSty}>
        <label htmlFor="plan-supported" style={{ ...labelSty, marginBottom: 0 }}>{TIER_SELECT}</label>
        <select
          id="plan-supported"
          value={draft.supported !== null && present.has(draft.supported) ? draft.supported : ''}
          onChange={(e) => { setSupported(e.target.value); }}
          style={selectStyle}
          onFocus={onFocus}
          onBlur={onBlur}
        >
          <option value="">None</option>
          {columns.map((c) => <option key={c.participantId} value={c.participantId}>{c.label}</option>)}
        </select>
      </div>

      <div role="group" aria-label="Locations" style={sectionSty}>
        <div style={{ ...labelSty, marginBottom: 0 }}>Locations</div>
        {sites.length === 0 ? (
          <div style={noteSty}>This operation has no locations yet. Add them under Edit.</div>
        ) : (
          columns.map((c) => (
            <div key={c.participantId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', alignItems: 'center', gap: 8 }}>
              <span style={unitSty} title={c.name}>{c.label}</span>
              <select
                aria-label={`Location of ${c.label}`}
                value={sites.some((s) => s.id === draft.placements[c.participantId]) ? draft.placements[c.participantId] : ''}
                onChange={(e) => { place(c.participantId, e.target.value); }}
                style={selectStyle}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">No location</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          ))
        )}
      </div>

      <div role="group" aria-label="Must talk" style={sectionSty}>
        <div style={{ ...labelSty, marginBottom: 0 }}>Must talk</div>
        {draft.requirements.length === 0 ? (
          <div style={noteSty}>No requirements yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {draft.requirements.map((r, i) => (
              <li key={`${r.a}|${r.b}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ ...unitSty, flex: 1 }}>
                  {`${labelOf(r.a)} ↔ ${labelOf(r.b)}`}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${labelOf(r.a)} and ${labelOf(r.b)}`}
                  onClick={() => { removeRequirement(i); }}
                  style={removeSty}
                >
                  <CloseOutlinedIcon style={{ fontSize: 14 }} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 6, marginTop: 4 }}>
          <select
            aria-label="First unit"
            value={first}
            onChange={(e) => { setFirst(e.target.value); setSecond(''); }}
            style={selectStyle}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <option value="">Unit</option>
            {columns.map((c) => <option key={c.participantId} value={c.participantId}>{c.label}</option>)}
          </select>
          <select
            aria-label="Second unit"
            value={second}
            onChange={(e) => { setSecond(e.target.value); }}
            style={selectStyle}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <option value="">Unit</option>
            {partners.map((c) => <option key={c.participantId} value={c.participantId}>{c.label}</option>)}
          </select>
        </div>
        <Button
          size="small"
          variant="outlined"
          sx={{ ...BANNER_BTN_AMBER_SX, width: '100%' }}
          disabled={first === '' || second === ''}
          onClick={addRequirement}
        >
          Add
        </Button>
      </div>

      {error && <div role="alert" style={{ ...noteSty, color: 'var(--shf-error)', fontStyle: 'normal', marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="contained" disableElevation sx={BANNER_BTN_PRIMARY_SX} disabled={!dirty || save.isPending} onClick={handleSave}>
          Save
        </Button>
        <Button variant="outlined" sx={BANNER_BTN_PAPER_SX} disabled={!dirty || save.isPending} onClick={() => { setError(null); onReset(); }}>
          Reset
        </Button>
      </div>
    </section>
  );
}
