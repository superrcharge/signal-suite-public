import { afterEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, within } from '@/test/utils';
import { STATUS_COLORS } from '@/theme/asset-colors';
import type { Participant, Phase, Site } from '@/types';
import { column, model, row, source } from './interop-fixtures';
import { PhasePicture } from './phase-picture';
import { phaseRequirements } from './phase-plan-model';

// Counts how many times the ELK module is brought in: the focus layout must never do it.
const elk = vi.hoisted(() => ({ loads: 0 }));
vi.mock('elkjs/lib/elk.bundled.js', async (importOriginal) => {
  elk.loads += 1;
  return importOriginal();
});

const a1 = source('row-a', 'equipment', 'a1', 'A1');
const b1 = source('row-b', 'equipment', 'b1', 'B1');
const c1 = source('row-c', 'equipment', 'c1', 'C1');
const d1 = source('row-d', 'equipment', 'd1', 'D1');

const COLUMNS = [
  column('a', '#2E7D32', 'USA', [a1]),
  column('b', '', '', [b1, source('row-b', 'equipment', 'b2', 'B2'), source('row-b', 'equipment', 'b3', 'B3'),
    source('row-b', 'equipment', 'b4', 'B4'), source('row-b', 'equipment', 'b5', 'B5'), source('row-b', 'equipment', 'b6', 'B6')]),
  column('c', '', 'USN', [c1]),
  column('d', '', '', [d1]),
];
// A and B share three rows; B and C one; A reaches C only through B; D shares nothing.
const MODEL = model(COLUMNS, [
  row('waveform', 'x', 'X', '', [[a1], [b1], [], []]),
  row('waveform', 'y', 'Y', '', [[a1], [b1], [], []]),
  row('service', 'z', 'Z', '', [[a1], [b1], [], []]),
  row('transport', 'w', 'W', '', [[], [b1], [c1], []]),
  row('waveform', 'v', 'V', '', [[], [], [], [d1]]),
], 'ph1');

const SITES: Site[] = [
  { id: 's1', operation_id: 'op-1', position: 0, name: 'ISB' },
  { id: 's2', operation_id: 'op-1', position: 1, name: 'FSB' },
  { id: 's3', operation_id: 'op-1', position: 2, name: 'The X' },
];

const unit = (key: string): Participant => ({
  id: `row-${key}`, operation_id: 'op-1', organization_key: key,
  organization: { key, name: `${key} org`, short_label: key.toUpperCase(), branch: 'USA', color: '', adhoc: false },
  platform_ids: [], equipment_ids: [], waveform_abbrevs: [], service_abbrevs: [], transport_ids: [],
  asset_phases: {}, poc_name: '', poc_phone: '', poc_email: '', notes: '',
  created_by: '', updated_by: '', created_at: '', updated_at: '',
});
const PEOPLE = ['a', 'b', 'c', 'd', 'e'].map(unit);

const phase = (over: Partial<Phase> = {}, pairs: [string, string][] = []): Phase => ({
  id: 'ph1', operation_id: 'op-1', position: 1, name: 'Phase I',
  supported_participant_id: null,
  placements: { 'row-a': 's1', 'row-b': 's2', 'row-c': 's2' },
  requirements: pairs.map(([x, y], i) => ({ id: `r${String(i)}`, a: `row-${x}`, b: `row-${y}` })),
  ...over,
});

/** Renders, and waits for the layout, which is worked out asynchronously: until then the picture says it is laying out. */
const drawn = async (ph: Phase, sites: Site[] = SITES, m = MODEL) => {
  const out = render(<PhasePicture model={m} phase={ph} sites={sites} entries={phaseRequirements(ph, m, PEOPLE)} />);
  await screen.findByRole('img');
  return out;
};
const titles = () => screen.getAllByTestId('phase-box-title').map((t) => t.textContent);
const unitOf = (key: string) => screen.getAllByTestId('phase-unit').find((u) => u.getAttribute('data-unit') === `row-${key}`)!;

describe('PhasePicture boxes', () => {
  it('draws a box per location that has a unit in order, and No location last for the unplaced', async () => {
    await drawn(phase());
    expect(titles()).toEqual(['ISB', 'FSB', 'No location']);
    expect(screen.getAllByTestId('phase-box')[2]!.querySelector('rect')!.style.strokeDasharray).not.toBe('');
  });

  it('draws no box for a location with no unit in the phase, and names it under the picture', async () => {
    await drawn(phase({ placements: { 'row-a': 's1', 'row-b': 's1', 'row-c': 's1', 'row-d': 's1' } }), [
      ...SITES, { id: 's4', operation_id: 'op-1', position: 3, name: 'HLZ' },
    ]);
    expect(titles()).toEqual(['ISB']);
    expect(screen.getByTestId('phase-unused')).toHaveTextContent('Not used this phase: FSB, The X, HLZ');
  });

  it('says nothing about unused locations when every location has a unit', async () => {
    await drawn(phase({ placements: { 'row-a': 's1', 'row-b': 's2', 'row-c': 's3', 'row-d': 's3' } }));
    expect(screen.queryByTestId('phase-unused')).toBeNull();
  });

  it('draws every card of a crowded location inside its box, none over another', async () => {
    await drawn(phase({ placements: { 'row-a': 's1', 'row-b': 's1', 'row-c': 's1', 'row-d': 's1' } }));
    const r = (el: Element) => ({ x: Number(el.getAttribute('x')), y: Number(el.getAttribute('y')), w: Number(el.getAttribute('width')), h: Number(el.getAttribute('height')) });
    const box = r(screen.getByTestId('phase-box').querySelector('rect')!);
    const cards = screen.getAllByTestId('phase-unit').map((u) => r(u.querySelector('rect')!));
    expect(cards).toHaveLength(4);
    cards.forEach((c, i) => {
      expect(c.x >= box.x && c.y >= box.y && c.x + c.w <= box.x + box.w && c.y + c.h <= box.y + box.h, `card ${String(i)} in its box`).toBe(true);
      cards.slice(i + 1).forEach((o) => { expect(c.x < o.x + o.w && o.x < c.x + c.w && c.y < o.y + o.h && o.y < c.y + c.h).toBe(false); });
    });
  });

  it('puts the box of the supported unit first', async () => {
    await drawn(phase({ supported_participant_id: 'row-b' }));
    expect(titles()).toEqual(['FSB', 'ISB', 'No location']);
  });

  it('puts No location first when that is where the supported unit is', async () => {
    await drawn(phase({ supported_participant_id: 'row-d' }));
    expect(titles()).toEqual(['No location', 'ISB', 'FSB']);
  });

  it('draws No location only when a present unit has no placement, and none at all when there are no locations to say it of', async () => {
    await drawn(phase({ placements: { 'row-a': 's1', 'row-b': 's1', 'row-c': 's2', 'row-d': 's3' } }));
    expect(titles()).toEqual(['ISB', 'FSB', 'The X']);
  });

  it('puts a unit in the box its placement names, and one with a placement at a location that is gone under No location', async () => {
    await drawn(phase({ placements: { 'row-a': 's1', 'row-b': 's2', 'row-c': 'gone' } }));
    expect(unitOf('a')).toHaveAttribute('data-box', 's1');
    expect(unitOf('b')).toHaveAttribute('data-box', 's2');
    expect(unitOf('c')).toHaveAttribute('data-box', 'none');
    expect(unitOf('d')).toHaveAttribute('data-box', 'none');
  });

  it('puts every unit under one No location box when the operation has no locations', async () => {
    await drawn(phase(), []);
    expect(titles()).toEqual(['No location']);
    expect(screen.getAllByTestId('phase-unit')).toHaveLength(4);
  });

  it('says so when no unit is in the phase', () => {
    render(<PhasePicture model={model([], [], 'ph1')} phase={phase()} sites={SITES} entries={[]} />);
    expect(screen.getByText('No units are in this phase.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('scales to its container: a fixed coordinate width and no pixel width', async () => {
    await drawn(phase());
    const svg = screen.getByRole('img');
    // On screen the width is the fitted pixel width (see the Zoom tests); `fixed` keeps 100%.
    expect(svg).toHaveAttribute('width', String(Number(svg.getAttribute('viewBox')!.split(' ')[2]) * (Number(svg.getAttribute('height')) / Number(svg.getAttribute('viewBox')!.split(' ')[3]))));
    expect(svg.getAttribute('viewBox')).toMatch(/^0 0 1000 \d+$/);
  });

  it('is laid out at the width of its container, one unit to a pixel', async () => {
    const real = window.ResizeObserver;
    class Measured {
      constructor(private readonly cb: ResizeObserverCallback) {}
      observe() { this.cb([{ contentRect: { width: 640 } } as ResizeObserverEntry], this); }
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = Measured;
    try {
      await drawn(phase());
      expect(screen.getByRole('img').getAttribute('viewBox')).toMatch(/^0 0 640 \d+$/);
    } finally {
      window.ResizeObserver = real;
    }
  });
});

describe('PhasePicture units', () => {
  it('draws a card with its pip, label, branch chip and present assets, run together on at most two lines with the rest counted', async () => {
    await drawn(phase());
    const a = within(unitOf('a'));
    expect(a.getByText('A')).toBeInTheDocument();
    expect(a.getByTestId('phase-unit-branch')).toHaveTextContent('USA');
    expect(a.getByText('A1')).toBeInTheDocument();
    // B has six assets, which fit on two lines of a 160 wide card; it has no branch, so no chip.
    const b = within(unitOf('b'));
    expect(b.getByText('B1, B2, B3, B4, B5,')).toBeInTheDocument();
    expect(b.getByText('B6')).toBeInTheDocument();
    expect(b.queryByTestId('phase-unit-branch')).toBeNull();
    expect(unitOf('a').querySelectorAll('circle')[0]).toHaveStyle({ fill: '#2E7D32' });
  });

  it('marks the supported unit with an amber border and a TIER SELECT tag, and no other', async () => {
    await drawn(phase({ supported_participant_id: 'row-b' }));
    expect(unitOf('b')).toHaveAttribute('data-supported', 'true');
    expect(within(unitOf('b')).getByText('TIER SELECT')).toBeInTheDocument();
    const border = unitOf('b').querySelector('rect')!;
    expect(border.style.stroke).toBe('var(--shf-amber)');
    expect(border.style.strokeWidth).toBe('2');
    expect(screen.getAllByText('TIER SELECT')).toHaveLength(1);
    expect(unitOf('a')).toHaveAttribute('data-supported', 'false');
  });
});

describe('PhasePicture lines', () => {
  const pairs: [string, string][] = [['a', 'b'], ['a', 'c'], ['a', 'd'], ['a', 'e']];
  const lines = () => screen.getAllByTestId('phase-line');
  const line = (x: string, y: string) => lines().find((l) => l.getAttribute('data-a') === `row-${x}` && l.getAttribute('data-b') === `row-${y}`)!;
  /** The pill of a line, which is drawn apart from it so that no line runs through the text. */
  const pill = (x: string, y: string) => screen.getAllByTestId('phase-line-pill').find((g) => g.getAttribute('data-line') === line(x, y).getAttribute('data-line'))!;

  it('draws a line per requirement coloured by status, and none for a unit that is not in the phase', async () => {
    await drawn(phase({}, pairs));
    expect(lines()).toHaveLength(3);
    expect(line('a', 'b')).toHaveAttribute('data-status', 'direct');
    expect(line('a', 'c')).toHaveAttribute('data-status', 'relay');
    expect(line('a', 'd')).toHaveAttribute('data-status', 'cannot');
    expect(lines().some((l) => l.getAttribute('data-b') === 'row-e')).toBe(false);
  });

  it('draws direct solid in the success colour, relay dashed in amber, cannot solid in the error colour', async () => {
    await drawn(phase({}, pairs));
    const path = (g: Element) => g.querySelector('path') as SVGPathElement;
    expect(path(line('a', 'b'))).toHaveStyle({ stroke: STATUS_COLORS.available, strokeWidth: '2.5' });
    expect(path(line('a', 'b')).style.strokeDasharray).toBe('');
    expect(path(line('a', 'c'))).toHaveStyle({ stroke: 'var(--shf-amber-deep)' });
    expect(path(line('a', 'c')).style.strokeDasharray).not.toBe('');
    expect(path(line('a', 'd'))).toHaveStyle({ stroke: 'var(--shf-error)' });
    expect(path(line('a', 'd')).style.strokeDasharray).toBe('');
  });

  it('labels a direct line with its first shared means and the count of the rest, a relay with who it goes via, and a cannot with no link', async () => {
    await drawn(phase({}, pairs));
    const label = (g: Element) => within(g as HTMLElement).getByTestId('phase-line-label').textContent;
    // A and B share X, Y and Z, in that order.
    expect(label(pill('a', 'b'))).toBe('✓ X +2');
    expect(label(pill('a', 'c'))).toBe('↻ via B');
    expect(label(pill('a', 'd'))).toBe('✕ no link');
    // The full answer stays in the line's title.
    expect(within(line('a', 'b')).getByText('A and B share X, Y, Z')).toBeInTheDocument();
  });

  it('labels a single shared means without a count', async () => {
    await drawn(phase({}, [['b', 'c']]));
    expect(within(pill('b', 'c')).getByTestId('phase-line-label')).toHaveTextContent(/^✓ W$/);
  });

  it('keeps every label clear of every card and of every other label, including lines inside one box', async () => {
    // B and C share a box, A and D are elsewhere, and every pair is required.
    const all: [string, string][] = [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd'], ['c', 'd']];
    await drawn(phase({}, all));
    const rect = (el: Element) => ({ x: Number(el.getAttribute('x')), y: Number(el.getAttribute('y')), w: Number(el.getAttribute('width')), h: Number(el.getAttribute('height')) });
    const hit = (p: ReturnType<typeof rect>, q: ReturnType<typeof rect>) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
    const pills = screen.getAllByTestId('phase-line-pill').map((g) => rect(g.querySelector('rect')!));
    const cards = screen.getAllByTestId('phase-unit').map((u) => rect(u.querySelector('rect')!));
    pills.forEach((p, i) => {
      cards.forEach((c) => { expect(hit(p, c), `label ${JSON.stringify(p)} over card ${JSON.stringify(c)}`).toBe(false); });
      pills.slice(i + 1).forEach((q) => { expect(hit(p, q), `label ${JSON.stringify(p)} over label ${JSON.stringify(q)}`).toBe(false); });
    });
  });

  it('draws every pill after every line, so no line is seen running through the text on one', async () => {
    await drawn(phase({}, pairs));
    const lastLine = lines()[lines().length - 1]!;
    for (const p of screen.getAllByTestId('phase-line-pill')) {
      expect(lastLine.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('steps every other line back while a unit is hovered, and restores them', async () => {
    const user = userEvent.setup();
    await drawn(phase({}, [['a', 'b'], ['b', 'c'], ['a', 'd']]));
    const opacity = (x: string, y: string) => line(x, y).style.opacity;
    expect(opacity('a', 'b')).toBe('1');
    await user.hover(unitOf('c'));
    expect(opacity('b', 'c')).toBe('1');
    expect(opacity('a', 'b')).toBe('0.14');
    expect(opacity('a', 'd')).toBe('0.14');
    await user.unhover(unitOf('c'));
    expect(opacity('a', 'd')).toBe('1');
  });
});

describe('PhasePicture legend', () => {
  it('shows all three line statuses and the supported swatch in every phase, stroked as the lines are', async () => {
    await drawn(phase({}, [['a', 'b'], ['a', 'c'], ['a', 'd']]));
    const key = within(screen.getByRole('list', { name: 'Key' }));
    expect(key.getByText('Direct')).toBeInTheDocument();
    expect(key.getByText('Relay - through the named unit')).toBeInTheDocument();
    expect(key.getByText('No link')).toBeInTheDocument();
    expect(key.getByText('Tier select')).toBeInTheDocument();
    const stroke = (el: Element) => { const st = (el as SVGElement).style; return [st.stroke, st.strokeWidth, st.strokeDasharray]; };
    for (const status of ['direct', 'relay', 'cannot']) {
      const sample = screen.getAllByTestId('phase-legend-line').find((l) => l.getAttribute('data-status') === status)!;
      const drawnLine = screen.getAllByTestId('phase-line').find((l) => l.getAttribute('data-status') === status)!.querySelector('path')!;
      expect(stroke(sample)).toEqual(stroke(drawnLine));
    }
    expect(screen.getByTestId('phase-legend-supported').style.borderColor).toBe('var(--shf-amber)');
  });

  it('is there with no requirements and while the layout is still being worked out', () => {
    render(<PhasePicture model={MODEL} phase={phase()} sites={SITES} entries={[]} />);
    expect(screen.getByRole('list', { name: 'Key' })).toBeInTheDocument();
    expect(screen.getAllByTestId('phase-legend-line')).toHaveLength(3);
  });
});

describe('PhasePicture line colour', () => {
  afterEach(() => { localStorage.clear(); });
  const pairs: [string, string][] = [['a', 'b'], ['a', 'c'], ['a', 'd']];

  it('colours every line by status, with no switch for anything else, and ignores a unit-colour choice left in storage by an older version', async () => {
    localStorage.setItem('signal-suite-operation-line-colour', 'units');
    await drawn(phase({}, pairs));
    expect(screen.queryByRole('group', { name: 'Line colour' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unit colours' })).toBeNull();
    expect(screen.queryAllByTestId('phase-line-half')).toHaveLength(0);
    expect(screen.queryAllByTestId('phase-line-halo')).toHaveLength(0);
    expect(screen.queryByTestId('phase-line-cross')).toBeNull();
    expect(screen.queryByTestId('phase-legend-halves')).toBeNull();
    const path = (status: string) => screen.getAllByTestId('phase-line').find((l) => l.getAttribute('data-status') === status)!.querySelector('path')!;
    expect(path('direct')).toHaveStyle({ stroke: STATUS_COLORS.available });
    expect(path('relay')).toHaveStyle({ stroke: 'var(--shf-amber-deep)' });
    expect(path('cannot')).toHaveStyle({ stroke: 'var(--shf-error)' });
  });

  it('puts a status glyph in front of every pill, with the pill border in the status colour', async () => {
    await drawn(phase({}, pairs));
    const texts = screen.getAllByTestId('phase-line-label').map((t) => t.textContent.charAt(0)).sort();
    expect(texts).toEqual(['↻', '✓', '✕']);
    // Each pill's border is the stroke of the line it belongs to, and the three differ.
    const strokeOf = (id: string | null) => screen.getAllByTestId('phase-line').find((l) => l.getAttribute('data-line') === id)!.querySelector('path')!.style.stroke;
    const pills = screen.getAllByTestId('phase-line-pill');
    for (const g of pills) expect(g.querySelector('rect')!.style.stroke).toBe(strokeOf(g.getAttribute('data-line')));
    expect(new Set(pills.map((g) => g.querySelector('rect')!.style.stroke)).size).toBe(3);
    // The key carries the three status icons beside its samples.
    const key = within(screen.getByRole('list', { name: 'Key' }));
    const icons = key.getAllByRole('img', { hidden: true }).map((i) => i.getAttribute('data-status'));
    expect([...icons].sort()).toEqual(['cannot', 'direct', 'relay']);
  });
});

describe('PhasePicture layout', () => {
  afterEach(() => { localStorage.clear(); });
  const pairs: [string, string][] = [['a', 'b'], ['a', 'c'], ['a', 'd']];

  it('has no layout switch, and ignores a hub or flow choice left in storage by an older version', async () => {
    localStorage.setItem('signal-suite-operation-layout', 'hub');
    await drawn(phase({ supported_participant_id: 'row-a' }, pairs));
    expect(screen.queryByRole('group', { name: 'Layout' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hub' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Flow' })).toBeNull();
    // Show and Zoom are the only controls beside the key.
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Show', 'Zoom']);
  });

  it('lays All out with ELK, which it brings in only once it is asked to draw', async () => {
    const before = elk.loads;
    await drawn(phase({ supported_participant_id: 'row-a' }, pairs));
    expect(screen.getAllByTestId('phase-line')).toHaveLength(3);
    expect(screen.getAllByTestId('phase-box').length).toBeGreaterThan(0);
    expect(elk.loads).toBeLessThanOrEqual(before + 1);
  });
});

describe('PhasePicture requirement list', () => {
  const items = () => screen.getAllByTestId('phase-requirement').map((li) => li.textContent);

  it('lists each requirement with how it is met, so the picture reads without hovering', async () => {
    await drawn(phase({}, [['a', 'b'], ['a', 'c'], ['a', 'd'], ['a', 'e']]));
    expect(items()).toEqual([
      'A - Bdirect: X, Y, Z',
      'A - Cvia B',
      'A - Dno link',
      'A - Enot in this phase: E',
    ]);
    expect(screen.getAllByTestId('phase-requirement').map((li) => li.getAttribute('data-status'))).toEqual(['direct', 'relay', 'cannot', 'absent']);
  });

  it('says so when the phase sets no requirements, and draws no line', async () => {
    await drawn(phase());
    expect(screen.getByText('No requirements set for this phase')).toBeInTheDocument();
    expect(screen.queryByTestId('phase-line')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Requirements' })).toBeNull();
  });
});

describe('PhasePicture stacking', () => {
  it('draws every line under every card, and every pill over them, so a crossing never cuts a card\'s text', async () => {
    await drawn(phase({}, [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c']]));
    const drawnLines = screen.getAllByTestId('phase-line');
    const lastLine = drawnLines[drawnLines.length - 1]!;
    const firstPill = screen.getAllByTestId('phase-line-pill')[0]!;
    for (const u of screen.getAllByTestId('phase-unit')) {
      expect(lastLine.compareDocumentPosition(u) & Node.DOCUMENT_POSITION_FOLLOWING, 'card after the lines').toBeTruthy();
      expect(firstPill.compareDocumentPosition(u) & Node.DOCUMENT_POSITION_PRECEDING, 'card before the pills').toBeTruthy();
    }
  });

  it('keeps an opaque base under a card that is faded, so the lines under it do not show through', async () => {
    const user = userEvent.setup();
    await drawn(phase({}, [['a', 'b'], ['a', 'c']]));
    expect(unitOf('d').previousElementSibling?.tagName).not.toBe('rect');
    await user.hover(screen.getAllByTestId('phase-line')[0]!);
    // The line A-B is lit, so C is faded; its base is a paper-filled rect right before it.
    const base = unitOf('c').previousElementSibling as SVGRectElement;
    expect(base.tagName).toBe('rect');
    expect(base.style.fill).toBe('var(--shf-paper)');
    expect(unitOf('c').style.opacity).toBe('0.4');
  });
});

describe('PhasePicture show', () => {
  afterEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });
  const pairs: [string, string][] = [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'c']];
  const choice = (name: string) => screen.getByRole('button', { name });
  const focusSearch = () => new URLSearchParams(window.location.search).get('focus');
  const lineIds = () => screen.queryAllByTestId('phase-line').map((l) => `${l.getAttribute('data-a')?.slice(4) ?? ''}${l.getAttribute('data-b')?.slice(4) ?? ''}`).sort();
  const rectOf = (el: Element) => { const r = el.querySelector('rect')!; return [r.getAttribute('x'), r.getAttribute('y'), r.getAttribute('width'), r.getAttribute('height')]; };
  const items = () => screen.queryAllByTestId('phase-requirement').map((li) => li.textContent);

  it('is All unless told otherwise, with the three switches first in the controls and the pressed one marked', async () => {
    await drawn(phase({}, pairs));
    const show = within(screen.getByRole('group', { name: 'Show' }));
    expect(show.getAllByRole('button').map((b) => b.textContent)).toEqual(['All', 'Gaps', 'Focus']);
    expect(show.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(show.getByRole('button', { name: 'Gaps' })).toHaveAttribute('aria-pressed', 'false');
    expect(lineIds()).toEqual(['ab', 'ac', 'ad', 'bc']);
  });

  describe('Gaps', () => {
    it('draws only the relay and no-means lines, and says how many, by kind', async () => {
      const user = userEvent.setup();
      await drawn(phase({}, pairs));
      await user.click(choice('Gaps'));
      expect(choice('Gaps')).toHaveAttribute('aria-pressed', 'true');
      expect(lineIds()).toEqual(['ac', 'ad']);
      expect(screen.getAllByTestId('phase-line-pill')).toHaveLength(2);
      expect(screen.getByTestId('phase-gaps-message')).toHaveTextContent('2 gaps in this phase: 1 relay, 1 no link');
    });

    it('says gap in the singular, and leaves out a kind there is none of', async () => {
      const user = userEvent.setup();
      await drawn(phase({}, [['a', 'b'], ['a', 'c']]));
      await user.click(choice('Gaps'));
      expect(screen.getByTestId('phase-gaps-message')).toHaveTextContent(/^1 gap in this phase: 1 relay$/);
    });

    it('says there are no gaps, in the success colour, when every requirement is direct, and draws no line', async () => {
      const user = userEvent.setup();
      await drawn(phase({}, [['a', 'b'], ['b', 'c']]));
      await user.click(choice('Gaps'));
      const message = screen.getByTestId('phase-gaps-message');
      expect(message).toHaveTextContent('No gaps - every requirement in this phase is direct');
      expect(message).toHaveStyle({ color: STATUS_COLORS.available });
      expect(lineIds()).toEqual([]);
      expect(screen.queryByRole('list', { name: 'Requirements' })).toBeNull();
    });

    it('keeps every card exactly where All has it', async () => {
      const user = userEvent.setup();
      await drawn(phase({ supported_participant_id: 'row-a' }, pairs));
      const where = () => ['a', 'b', 'c', 'd'].map((k) => rectOf(unitOf(k)));
      const all = where();
      await user.click(choice('Gaps'));
      expect(where()).toEqual(all);
      expect(screen.getAllByTestId('phase-unit')).toHaveLength(4);
    });

    it('fades the units that have no gap and no other, and lists only the gaps', async () => {
      const user = userEvent.setup();
      // B is on a direct line only; A, C and D are each on a gap.
      await drawn(phase({}, pairs));
      await user.click(choice('Gaps'));
      expect(unitOf('b').style.opacity).toBe('0.35');
      for (const k of ['a', 'c', 'd']) expect(unitOf(k).style.opacity, `unit ${k}`).toBe('1');
      expect(items()).toEqual(['A - Cvia B', 'A - Dno link']);
    });

    it('keeps the legend, and the pills and badges of the gaps it draws', async () => {
      const user = userEvent.setup();
      await drawn(phase({}, pairs));
      await user.click(choice('Gaps'));
      expect(screen.getAllByTestId('phase-legend-line')).toHaveLength(3);
      const labels = screen.getAllByTestId('phase-line-label').map((t) => t.textContent);
      expect(labels).toEqual(expect.arrayContaining(['↻ via B', '✕ no link']));
    });
  });

  describe('Focus', () => {
    it('puts the supported unit in focus, offers every unit of the phase to choose from, and draws its lines only', async () => {
      const user = userEvent.setup();
      await drawn(phase({ supported_participant_id: 'row-b' }, pairs));
      await user.click(choice('Focus'));
      const units = within(screen.getByRole('group', { name: 'Focus unit' }));
      expect(units.getAllByRole('button').map((b) => b.textContent)).toEqual(['A', 'B', 'C', 'D']);
      expect(units.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
      // B is on a-b and b-c.
      expect(lineIds()).toEqual(['ab', 'bc']);
      expect(screen.getAllByTestId('phase-unit')).toHaveLength(3);
      expect(screen.queryByTestId('phase-box')).toBeNull();
      expect(items()).toEqual(['A - Bdirect: X, Y, Z', 'B - Cdirect: W']);
    });

    it('starts on the unit with most requirements when none is supported, and on the first when the phase has none', async () => {
      const user = userEvent.setup();
      const first = await drawn(phase({}, pairs));
      await user.click(choice('Focus'));
      expect(within(screen.getByRole('group', { name: 'Focus unit' })).getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
      first.unmount();
      await drawn(phase());
      // A fresh draw opens on All, so Focus is chosen again here.
      await user.click(choice('Focus'));
      expect(within(screen.getByRole('group', { name: 'Focus unit' })).getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('writes the chosen unit to ?focus= and follows it, and a unit the phase does not have reads as the default', async () => {
      const user = userEvent.setup();
      window.history.replaceState(null, '', '/?other=1&focus=gone');
      await drawn(phase({ supported_participant_id: 'row-b' }, pairs));
      await user.click(choice('Focus'));
      expect(within(screen.getByRole('group', { name: 'Focus unit' })).getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'true');
      await user.click(within(screen.getByRole('group', { name: 'Focus unit' })).getByRole('button', { name: 'C' }));
      expect(focusSearch()).toBe('row-c');
      expect(new URLSearchParams(window.location.search).get('other')).toBe('1');
      expect(lineIds()).toEqual(['ac', 'bc']);
      expect(screen.getAllByTestId('phase-unit').map((u) => u.getAttribute('data-unit')?.slice(4)).sort()).toEqual(['a', 'b', 'c']);
    });

    it('tags each partner with where it is, and the focus unit with nothing', async () => {
      const user = userEvent.setup();
      await drawn(phase({}, pairs));
      await user.click(choice('Focus'));
      await user.click(within(screen.getByRole('group', { name: 'Focus unit' })).getByRole('button', { name: 'C' }));
      const place = (k: string) => within(unitOf(k)).queryByTestId('phase-unit-place')?.textContent;
      expect(place('a')).toBe('@ ISB');
      expect(place('b')).toBe('@ FSB');
      expect(place('c')).toBeUndefined();
      await user.click(within(screen.getByRole('group', { name: 'Focus unit' })).getByRole('button', { name: 'A' }));
      expect(place('d')).toBe('@ No location');
    });

    it('is reached by clicking a card in All, titled for what it does, and again in Gaps', async () => {
      const user = userEvent.setup();
      await drawn(phase({}, pairs));
      expect(within(unitOf('c')).getByText('Focus on C')).toBeInTheDocument();
      expect(unitOf('c').style.cursor).toBe('pointer');
      await user.click(unitOf('c'));
      expect(choice('Focus')).toHaveAttribute('aria-pressed', 'true');
      expect(focusSearch()).toBe('row-c');
      expect(lineIds()).toEqual(['ac', 'bc']);
      // From Focus a partner is a way to move on, and the focus itself is not a control.
      expect(unitOf('c').style.cursor).toBe('');
      await user.click(unitOf('a'));
      expect(focusSearch()).toBe('row-a');
      await user.click(choice('Gaps'));
      await user.click(unitOf('d'));
      expect(choice('Focus')).toHaveAttribute('aria-pressed', 'true');
      expect(focusSearch()).toBe('row-d');
    });

    it('says so, with the unit alone, when it has no requirements, and lists nothing', async () => {
      const user = userEvent.setup();
      await drawn(phase({}, [['a', 'b']]));
      await user.click(choice('Focus'));
      await user.click(within(screen.getByRole('group', { name: 'Focus unit' })).getByRole('button', { name: 'D' }));
      expect(screen.getByTestId('phase-focus-empty')).toHaveTextContent('D has no requirements in this phase');
      expect(screen.getAllByTestId('phase-unit')).toHaveLength(1);
      expect(screen.queryByTestId('phase-line')).toBeNull();
      expect(screen.queryByRole('list', { name: 'Requirements' })).toBeNull();
    });

    it('does not bring in ELK, and keeps the hover highlight and the legend', async () => {
      const user = userEvent.setup();
      // The view opens on All, which is the ELK layout, so the count that
      // must not move is taken once Focus is chosen.
      await drawn(phase({}, pairs));
      await user.click(choice('Focus'));
      const before = elk.loads;
      await user.hover(unitOf('a'));
      expect(elk.loads).toBe(before);
      expect(screen.getAllByTestId('phase-legend-line')).toHaveLength(3);
      const lineAB = () => screen.getAllByTestId('phase-line').find((l) => l.getAttribute('data-b') === 'row-b')!;
      await user.hover(unitOf('c'));
      expect(lineAB().style.opacity).toBe('0.14');
    });
  });

  it('opens on All every time, and writes each choice for the exports to read', async () => {
    // It used to reopen on the viewer's last choice; a unit clicked yesterday
    // then reopened the view in Focus, so since 2026-10-14 it starts at the
    // left chip and the stored value only tells the print and deck exports
    // what the screen is showing.
    const user = userEvent.setup();
    const first = await drawn(phase({}, pairs));
    expect(choice('All')).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('signal-suite-operation-show')).toBe('all');
    await user.click(choice('Gaps'));
    expect(localStorage.getItem('signal-suite-operation-show')).toBe('gaps');
    first.unmount();
    await drawn(phase({}, pairs));
    expect(choice('All')).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('signal-suite-operation-show')).toBe('all');
    expect(lineIds()).toEqual(['ab', 'ac', 'ad', 'bc']);
  });
});

describe('PhasePicture zoom', () => {
  afterEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });
  const pairs: [string, string][] = [['a', 'b'], ['a', 'c']];
  const drawnFocus = async () => {
    window.history.replaceState(null, '', '/?focus=row-a');
    const user = userEvent.setup();
    const out = await drawn(phase({}, pairs));
    await user.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Focus' }));
    return { user, out };
  };
  const svg = () => screen.getByRole('img');
  const dims = () => svg().getAttribute('viewBox')!.split(' ').slice(2).map(Number) as [number, number];
  const label = () => within(screen.getByRole('group', { name: 'Zoom' })).getByText(/%$/).textContent;
  const fitChip = () => within(screen.getByRole('group', { name: 'Zoom' })).getByRole('button', { name: 'Fit' });

  it('fits the canvas by default: Fit is pressed and the drawing is no larger than the frame', async () => {
    // A frame narrower than the drawing's own minimum width, so fitting has to shrink it.
    const real = window.ResizeObserver;
    class Narrow {
      constructor(private readonly cb: ResizeObserverCallback) {}
      observe() { this.cb([{ contentRect: { width: 120 } } as ResizeObserverEntry], this); }
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = Narrow;
    try {
      await drawnFocus();
      const [w, h] = dims();
      expect(w).toBeGreaterThan(120);
      expect(fitChip()).toHaveAttribute('aria-pressed', 'true');
      expect(Number(svg().getAttribute('width'))).toBeCloseTo(120, 0);
      expect(Number(svg().getAttribute('height'))).toBeLessThan(h);
      expect(Number(svg().getAttribute('height'))).toBeLessThanOrEqual(Math.max(420, window.innerHeight - 230));
    } finally {
      window.ResizeObserver = real;
    }
  });

  it('zooms in out of fit, rising by a quarter, and the width follows the scale', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300);
    const { user } = await drawnFocus();
    const before = Number(label()?.replace('%', '') ?? 0);
    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(fitChip()).toHaveAttribute('aria-pressed', 'false');
    const after = Number(label()?.replace('%', '') ?? 0);
    expect(after).toBeGreaterThan(before);
    const [w] = dims();
    expect(Number(svg().getAttribute('width'))).toBeCloseTo(w * (before / 100) * 1.25, 0);
  });

  it('never zooms out below 25%, and Fit returns to the fitted scale', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300);
    const { user } = await drawnFocus();
    const fitted = label();
    for (let i = 0; i < 12; i += 1) await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(label()).toBe('25%');
    await user.click(fitChip());
    expect(fitChip()).toHaveAttribute('aria-pressed', 'true');
    expect(label()).toBe(fitted);
  });

  it('draws no Zoom group in a fixed render, and keeps its old width', async () => {
    render(<PhasePicture model={MODEL} phase={phase({}, pairs)} sites={SITES} entries={phaseRequirements(phase({}, pairs), MODEL, PEOPLE)} fixed={{ show: 'focus', focusId: 'row-a' }} />);
    await screen.findByRole('img');
    expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull();
    expect(screen.getByRole('img')).toHaveAttribute('width', '100%');
    expect(screen.getByRole('img')).not.toHaveAttribute('height');
  });
});
