import { useEffect, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Tab, Tabs } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PersonAddIcon from '@mui/icons-material/PersonAdd';

import { BANNER_BTN_AMBER_SX, BANNER_BTN_PAPER_SX, CONTENT_LINE } from '@/components/common/banner-controls';
import { folderTabsSx } from '@/components/common/folder-tabs-sx';
import { branchChip } from '@/components/catalog/branch-colors';
import { chipSty } from '@/components/catalog/chip-styles';
import type { Equipment, Participant, Phase, Platform, Site, Transport } from '@/types';
import { buildInterop, isPresent } from './interop-model';
import type { InteropModel } from './interop-model';
import { participantLabel, participantSubName } from './participant-label';
import { equipmentServices, equipmentWaveforms, platformWaveforms } from './participant-waveforms';
import { phaseCaption } from './phase-marks';
import { PAIR_COLOR, phaseRequirements } from './phase-plan-model';
import type { RequirementEntry } from './phase-plan-model';
import { equipmentLabel, transportLabel } from './pick-strip-styles';
import { TIER_SELECT } from './phase-picture-model';
import { StatusIcon } from './status-icon';
import type { StatusKind } from './status-icon';
import { useInteropInput } from './use-interop-input';

const LIBRARY_CHIP_TEXT = 10.5;

const monoCaptionSty: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em',
  textTransform: 'uppercase', color: 'var(--shf-graphite-300)',
};
const NO_PHASES: Phase[] = [];
const NO_SITES: Site[] = [];
const PANEL_ID = 'unit-panel';
const tabId = (participantId: string) => `unit-tab-${participantId}`;

const bodySty: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--shf-paper)' };

/** What an empty subsection says, so the panel's layout is the same for every unit. */
const noneSty: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 12.5, fontStyle: 'italic', color: 'var(--shf-graphite-400)' };

/**
 * The open tab's page: the folder body the selected tab sits flush on, so
 * both are the same graphite and the tab reads as the panel's own. Top
 * corners square, as the Nets table's are under its tabs.
 */
const PANEL_BG = 'var(--shf-graphite-800)';

const pipSty = (color: string): CSSProperties => ({
  display: 'block', width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
  background: color || 'transparent',
  border: color ? 0 : '1px solid var(--shf-graphite-600)',
});

/**
 * The catalog card's SATCOM / Radio badge, at heading size. Its width is
 * what the sub-chips indent by, so `minWidth` is fixed rather than measured:
 * the two words differ in length and the chips under a Radio and a SATCOM
 * heading must line up.
 */
const KIND_BADGE_W = 52;
type Kind = 'satcom' | 'radio' | 'platform';
function kindBadgeSty(kind: Kind): CSSProperties {
  // Platform is the third kind: paper on graphite, so it reads as the
  // carrier rather than as one more radio or terminal.
  const fill = kind === 'satcom' ? 'var(--shf-amber)' : kind === 'radio' ? 'var(--shf-info)' : 'var(--shf-graphite-600)';
  return {
    padding: '2px 0', borderRadius: 2, flexShrink: 0, minWidth: KIND_BADGE_W, textAlign: 'center',
    background: fill,
    color: kind === 'satcom' ? 'var(--shf-black)' : 'var(--shf-paper)',
    fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
    letterSpacing: '0.14em', textTransform: 'uppercase',
  };
}

const headingSty: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
  letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--shf-paper)', lineHeight: 1.1,
  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const quotedNameSty: CSSProperties = {
  fontFamily: 'var(--font-condensed)', fontWeight: 500, fontSize: 12,
  letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--shf-amber)', whiteSpace: 'nowrap',
};

/**
 * One declared platform as a heading in the same shape as an equipment row:
 * the PLATFORM badge, the designation, the popular name in amber quotes and
 * its branches, with what it carries beneath - its own waveforms as amber
 * chips, then "carries" and the nomenclatures of the catalog radios it
 * lists, when any resolve. A platform the library no longer has is struck
 * through by id, as a missing equipment record is.
 */
function PlatformRow({ id, pl, equipmentById, phases }: { id: string; pl: Platform | undefined; equipmentById: ReadonlyMap<string, Equipment>; phases?: string }) {
  if (!pl) {
    return (
      <li title="Not in the Platform Library" style={{ ...bodySty, textDecoration: 'line-through', color: 'var(--shf-graphite-400)', listStyle: 'none' }}>
        {id}
      </li>
    );
  }
  const waveforms = platformWaveforms(pl, equipmentById);
  const radios = pl.equipment_ids.flatMap((eid) => { const eq = equipmentById.get(eid); return eq ? [equipmentLabel(eq)] : []; });
  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, listStyle: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={kindBadgeSty('platform')}>Platform</span>
        <span style={headingSty}>{pl.designation || pl.id}</span>
        {pl.popular_name && <span style={quotedNameSty}>"{pl.popular_name}"</span>}
        {pl.category.map((b) => <span key={b} style={branchChip(b, LIBRARY_CHIP_TEXT)}>{b}</span>)}
      </div>
      {phases && <div style={{ ...monoCaptionSty, paddingLeft: KIND_BADGE_W + 8 }}>{phases}</div>}
      {(waveforms.length > 0 || radios.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, paddingLeft: KIND_BADGE_W + 8 }}>
          {waveforms.map((a) => <span key={`w-${a}`} style={chipSty('amber')}>{a}</span>)}
          {radios.length > 0 && (
            <>
              <span style={{ ...monoCaptionSty, marginLeft: waveforms.length > 0 ? 4 : 0 }}>carries</span>
              <span style={bodySty}>{radios.join(', ')}</span>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * One picked record as a heading in the catalog card's title shape - the
 * badge, the nomenclature in the display font, the nickname in amber quotes -
 * with what it carries as small chips beneath, indented under the heading by
 * the badge's width so they read as its own. A radio's waveforms are amber,
 * as the catalog card draws its primary identifiers; a terminal's services
 * are paper, and its waveforms, when it lists any, follow them in amber.
 */
function EquipmentRow({ id, eq, phases }: { id: string; eq: Equipment | undefined; phases?: string }) {
  if (!eq) {
    return (
      <li title="Not in the Equipment Catalog" style={{ ...bodySty, textDecoration: 'line-through', color: 'var(--shf-graphite-400)', listStyle: 'none' }}>
        {id}
      </li>
    );
  }
  const isSatcom = eq.terminal_type !== 'radio';
  const waveforms = equipmentWaveforms(eq);
  const services = isSatcom ? equipmentServices(eq) : [];
  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, listStyle: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={kindBadgeSty(isSatcom ? 'satcom' : 'radio')}>{isSatcom ? 'SATCOM' : 'Radio'}</span>
        <span style={headingSty}>{eq.nomenclature || eq.id}</span>
        {eq.nickname && <span style={quotedNameSty}>"{eq.nickname}"</span>}
      </div>
      {phases && <div style={{ ...monoCaptionSty, paddingLeft: KIND_BADGE_W + 8 }}>{phases}</div>}
      {(services.length > 0 || waveforms.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: KIND_BADGE_W + 8 }}>
          {services.map((a) => <span key={`s-${a}`} style={chipSty('paper')}>{a}</span>)}
          {waveforms.map((a) => <span key={`w-${a}`} style={chipSty('amber')}>{a}</span>)}
        </div>
      )}
    </li>
  );
}

/** One transport as a row in the same shape as the asset rows above it: the badge, the label, its phases beneath. */
function TransportRow({ id, t, phases }: { id: string; t: Transport | undefined; phases?: string }) {
  return (
    <li style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, listStyle: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={kindBadgeSty('platform')}>Transport</span>
        <span style={headingSty}>{t ? transportLabel(t) : id}</span>
      </div>
      {phases && <div style={{ ...monoCaptionSty, paddingLeft: KIND_BADGE_W + 8 }}>{phases}</div>}
    </li>
  );
}

/** A subsection's name in a column of its own, with what it holds beside it; the grid is what keeps every unit's panel the same shape. */
function Subsection({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', columnGap: 12, alignItems: 'start' }}>
      <div style={{ ...monoCaptionSty, paddingTop: 3 }}>{caption}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

const sectionHeadSty: CSSProperties = {
  ...monoCaptionSty, color: 'var(--shf-amber)', letterSpacing: '0.16em',
  paddingBottom: 6, marginBottom: 10, borderBottom: '1px solid var(--shf-graphite-700)',
};

const listSty: CSSProperties = { margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };

const thSty: CSSProperties = {
  ...monoCaptionSty, textAlign: 'left', fontWeight: 400, padding: '0 14px 6px 0',
  borderBottom: '1px solid var(--shf-graphite-700)',
};
const tdSty: CSSProperties = {
  ...bodySty, verticalAlign: 'top', padding: '7px 14px 7px 0',
  borderBottom: '1px solid var(--shf-graphite-700)',
};
const phaseNameSty: CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em',
  textTransform: 'uppercase', color: 'var(--shf-paper)', whiteSpace: 'nowrap',
};

/** What one phase asks of the board, worked out once for every unit's By phase table. */
interface PhaseView {
  phase: Phase;
  model: InteropModel;
  entries: RequirementEntry[];
}

/**
 * One requirement of a phase as the unit it is about reads it: the other
 * unit and how they stand, in the Web legend's colour and glyph. "TF RED -
 * SINCGARS +1" when they share means (the first, and how many more), "CAS via
 * TF WHITE" through a relay, "JOC - no link" when nothing links them,
 * and "JOC - not in this phase" when the other unit has nothing in it.
 */
function requirementLine(e: RequirementEntry, unitId: string, labelOf: (id: string) => string): { kind: StatusKind; text: string } {
  const partner = e.a === unitId ? e.bLabel : e.aLabel;
  const s = e.status;
  switch (s.status) {
    case 'direct': return { kind: 'direct', text: `${partner} - ${s.means[0] ?? ''}${s.means.length > 1 ? ` +${String(s.means.length - 1)}` : ''}` };
    case 'relay': return { kind: 'relay', text: `${partner} via ${labelOf(s.via[0] ?? '')}${s.via.length > 1 ? ` +${String(s.via.length - 1)}` : ''}` };
    case 'cannot': return { kind: 'cannot', text: `${partner} - no link` };
    case 'absent': return { kind: 'absent', text: `${partner} - not in this phase` };
  }
}

/**
 * The unit's part in each phase, one row per phase: where it sits, whether
 * the phase supports it, and the requirements that name it with how each
 * stands. A phase the unit has nothing in reads "Not in this phase" across
 * the row, the same words the model uses for a unit that is not a column.
 */
function ByPhase({ unit, byPhase, sites, labelOf }: {
  unit: Participant;
  byPhase: PhaseView[];
  sites: ReadonlyMap<string, Site>;
  labelOf: (id: string) => string;
}) {
  if (byPhase.length === 0) return <span style={noneSty}>This operation has no phases.</span>;
  return (
    <table aria-label={`${participantLabel(unit)} by phase`} style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th scope="col" style={{ ...thSty, width: 110 }}>Phase</th>
          <th scope="col" style={{ ...thSty, width: 150 }}>Location</th>
          <th scope="col" style={{ ...thSty, width: 110 }}>{TIER_SELECT}</th>
          <th scope="col" style={thSty}>Must talk</th>
        </tr>
      </thead>
      <tbody>
        {byPhase.map(({ phase, model, entries }) => {
          if (!model.columns.some((c) => c.participantId === unit.id)) {
            return (
              <tr key={phase.id}>
                <th scope="row" style={{ ...tdSty, textAlign: 'left' }}><span style={phaseNameSty}>{phase.name}</span></th>
                <td colSpan={3} style={{ ...tdSty, ...noneSty }}>Not in this phase</td>
              </tr>
            );
          }
          const site = sites.get(phase.placements[unit.id] ?? '');
          const lines = entries
            .filter((e) => e.a === unit.id || e.b === unit.id)
            .map((e) => ({ id: e.id, ...requirementLine(e, unit.id, labelOf) }));
          return (
            <tr key={phase.id}>
              <th scope="row" style={{ ...tdSty, textAlign: 'left' }}><span style={phaseNameSty}>{phase.name}</span></th>
              <td style={tdSty}>{site ? site.name : <span style={{ color: 'var(--shf-graphite-400)' }}>-</span>}</td>
              <td style={tdSty}>{phase.supported_participant_id === unit.id && <span style={chipSty('amber')}>{TIER_SELECT.toUpperCase()}</span>}</td>
              <td style={tdSty}>
                {lines.length === 0 ? (
                  <span style={noneSty}>No requirements</span>
                ) : (
                  <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {lines.map((l) => (
                      <li key={l.id} style={{ listStyle: 'none', display: 'flex', gap: 6, alignItems: 'center', color: l.kind === 'absent' ? 'var(--shf-graphite-300)' : 'var(--shf-paper)' }}>
                        <StatusIcon kind={l.kind} color={l.kind === 'absent' ? 'var(--shf-graphite-400)' : PAIR_COLOR[l.kind]} size={13} />
                        <span>{l.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * One unit's page, the same four parts in the same order for every unit:
 * the header, what it brings, what each phase asks of it, and who to call.
 * An empty part says None rather than closing up, so flipping between tabs
 * never moves a heading.
 */
function UnitPanel({ unit: p, equipmentById, platformById, transportById, phases, byPhase, sites, labelOf, canWrite, onEdit }: {
  unit: Participant;
  equipmentById: ReadonlyMap<string, Equipment>;
  platformById: ReadonlyMap<string, Platform>;
  transportById: ReadonlyMap<string, Transport>;
  phases: Phase[];
  byPhase: PhaseView[];
  sites: ReadonlyMap<string, Site>;
  labelOf: (id: string) => string;
  canWrite: boolean;
  onEdit: (participant: Participant) => void;
}) {
  const o = p.organization;
  // Under an asset that is not in every phase, the ones it is in; nothing
  // when it is in all of them, so a panel only says what is unusual.
  const phasesOf = (assetId: string) => phaseCaption(phases, (phaseId) => isPresent(p, assetId, phaseId), 'runs');
  const label = participantLabel(p);
  const contact = [p.poc_name, p.poc_phone, p.poc_email].filter(Boolean);
  const subName = participantSubName(p);
  // Transports are the one thing picked by hand past the assets, since
  // 2026-10-09: waveforms and services are what the platform and equipment
  // headings already show. An older row's stored direct picks still count
  // in `effectiveWaveforms` and the matrix; they are not drawn here.

  return (
    <div
      role="tabpanel"
      id={PANEL_ID}
      aria-labelledby={tabId(p.id)}
      style={{ background: PANEL_BG, padding: 18, display: 'flex', flexDirection: 'column', gap: 20 }}
    >
      {/* Header: pip, label, name, branch, with Edit pinned to the top
          right so a label that wraps never pushes it off. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <span data-testid="participant-pip" style={pipSty(o.color)} />
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
            letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--shf-paper)', lineHeight: 1.1,
          }}>
            {label}
          </span>
          {subName && <span style={monoCaptionSty}>{subName}</span>}
          {o.branch && <span style={branchChip(o.branch, LIBRARY_CHIP_TEXT)}>{o.branch}</span>}
        </div>
        {canWrite && (
          <Button
            startIcon={<EditIcon />}
            size="small"
            variant="outlined"
            aria-label={`Edit ${label}`}
            sx={{ ...BANNER_BTN_PAPER_SX, flexShrink: 0 }}
            onClick={() => { onEdit(p); }}
          >
            Edit
          </Button>
        )}
      </div>

      {/* No "Brings" heading: the unit's tab already says whose these are.
          With no heading to set it apart, the panel's 20px section gap read as
          a hole under the header, so the gear starts 8px under it instead. */}
      <section aria-label={`${label} brings`} style={{ marginTop: -12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Subsection caption="Platforms">
            {p.platform_ids.length === 0 ? <span style={noneSty}>None</span> : (
              <ul aria-label={`${label} platforms`} style={listSty}>
                {p.platform_ids.map((id) => <PlatformRow key={id} id={id} pl={platformById.get(id)} equipmentById={equipmentById} phases={phasesOf(id)} />)}
              </ul>
            )}
          </Subsection>
          <Subsection caption="Equipment">
            {p.equipment_ids.length === 0 ? <span style={noneSty}>None</span> : (
              <ul aria-label={`${label} equipment`} style={listSty}>
                {p.equipment_ids.map((id) => <EquipmentRow key={id} id={id} eq={equipmentById.get(id)} phases={phasesOf(id)} />)}
              </ul>
            )}
          </Subsection>
          <Subsection caption="Transports">
            {p.transport_ids.length === 0 ? <span style={noneSty}>None</span> : (
              <ul aria-label={`${label} transports`} style={listSty}>
                {p.transport_ids.map((id) => <TransportRow key={id} id={id} t={transportById.get(id)} phases={phasesOf(id)} />)}
              </ul>
            )}
          </Subsection>
        </div>
      </section>

      <section aria-label={`${label} by phase`}>
        <div style={sectionHeadSty}>By phase</div>
        <ByPhase unit={p} byPhase={byPhase} sites={sites} labelOf={labelOf} />
      </section>

      <section aria-label={`${label} point of contact`}>
        <div style={sectionHeadSty}>POC</div>
        {contact.length === 0 ? <span style={noneSty}>None</span> : <span data-testid="participant-poc" style={bodySty}>{contact.join(' · ')}</span>}
      </section>
    </div>
  );
}

/**
 * The Nets Library's folder tabs, drawn for a row of units, through the shared
 * `folderTabsSx` so this strip, Nets and Settings cannot drift apart. Unlike
 * Nets the tabs scroll rather than share the width, since an operation can
 * hold a dozen units, and the open tab takes the graphite panel's colour
 * rather than the theme paper, which is white in light mode and would not
 * meet the panel.
 */
const tabsSx = folderTabsSx({ panelBg: PANEL_BG, tabPx: 2.5 });

/**
 * The operation page's Loadout view: one tab per participant, and under them
 * the open unit's panel, the same four parts for every unit. A dozen
 * organizations on one screen was too much to read, so each gets its own page
 * and the Participants popup in the banner is the quick roster that points
 * at them. The open tab is `?unit=<participant id>`; absent or unknown reads
 * as the first. A writer gets Edit on the unit; a reader gets the panel, or a
 * line saying no one has joined, and a writer with nobody yet gets Join
 * Operation. There is no Check out here: checking out has never meant
 * removing a row, so leaving an operation is not a panel control for now.
 *
 * The By phase table reads the same model as the Matrix and Web views, once
 * per phase, so the three agree on who is in a phase and what they can say
 * to each other.
 */
export function ParticipantBoard({ participants, phases = NO_PHASES, sites = NO_SITES, canWrite, onJoin, onEdit }: {
  participants: Participant[];
  /** The operation's phases in order; with fewer than two, no asset says which phase it is in. */
  phases?: Phase[];
  /** The operation's locations, for the By phase table's Location column. */
  sites?: Site[];
  canWrite: boolean;
  onJoin: () => void;
  onEdit: (participant: Participant) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isLoading, isError, input } = useInteropInput(participants);
  const { equipmentById, platformById, transportById } = input;

  const byPhase = useMemo<PhaseView[]>(() => phases.map((phase) => {
    const model = buildInterop({ ...input, phaseId: phase.id });
    return { phase, model, entries: phaseRequirements(phase, model, participants) };
  }), [phases, input, participants]);
  const siteById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const labels = useMemo(() => new Map(participants.map((p) => [p.id, participantLabel(p)])), [participants]);
  const labelOf = (id: string) => labels.get(id) ?? id;

  const first = participants[0];
  const unitParam = searchParams.get('unit');
  const openId = participants.find((p) => p.id === unitParam)?.id ?? first?.id;
  // MUI scrolls the open tab into view when it changes but not on mount, so a
  // link to a unit past the visible ones would open with its tab cut off.
  // jsdom has no scrollIntoView.
  useEffect(() => {
    if (openId === undefined) return;
    document.getElementById(tabId(openId))?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [openId]);

  if (first === undefined) {
    return canWrite ? (
      <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
        <Button startIcon={<PersonAddIcon />} size="small" variant="outlined" sx={BANNER_BTN_AMBER_SX} onClick={onJoin}>
          Join Operation
        </Button>
      </div>
    ) : (
      <div style={{
        padding: 60, textAlign: 'center',
        fontFamily: 'var(--font-body)', color: 'var(--shf-graphite-300)', fontStyle: 'italic',
      }}>
        No one has joined yet.
      </div>
    );
  }

  const selected = participants.find((p) => p.id === openId) ?? first;
  const selectUnit = (id: string) =>
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('unit', id);
      return n;
    }, { replace: true });

  return (
    // No top padding: the banner's own margin is the gap, so the tabs sit
    // right under it rather than a band of empty canvas lower.
    <div style={{ padding: `0 ${String(CONTENT_LINE)}px ${String(CONTENT_LINE)}px` }}>
      <Tabs
        value={selected.id}
        onChange={(_, next: string) => { selectUnit(next); }}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Loadout"
        sx={tabsSx}
      >
        {participants.map((p) => (
          <Tab
            key={p.id}
            value={p.id}
            id={tabId(p.id)}
            aria-controls={PANEL_ID}
            label={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span data-testid="tab-pip" aria-hidden="true" style={pipSty(p.organization.color)} />
                {participantLabel(p)}
              </span>
            }
          />
        ))}
      </Tabs>
      {isLoading ? (
        <div style={{ background: PANEL_BG, padding: 18, ...noneSty }}>Loading…</div>
      ) : isError ? (
        <div style={{ background: PANEL_BG, padding: 18, ...noneSty }}>
          Could not load the catalog, the waveform library or the platform library.
        </div>
      ) : (
        <UnitPanel
          key={selected.id}
          unit={selected}
          equipmentById={equipmentById}
          platformById={platformById}
          transportById={transportById}
          phases={phases}
          byPhase={byPhase}
          sites={siteById}
          labelOf={labelOf}
          canWrite={canWrite}
          onEdit={onEdit}
        />
      )}
    </div>
  );
}
