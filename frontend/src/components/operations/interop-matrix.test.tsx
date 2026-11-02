import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor, within } from '@/test/utils';
import { EMPTY_VALUE } from '@/utils';
import { column, model, row, source } from './interop-fixtures';
import { InteropMatrix } from './interop-matrix';

const brownRadio = source('row-brown', 'equipment', 'prc-152', 'AN/PRC-152');
const brownHawk = source('row-brown', 'platform', 'uh-60', 'UH-60M', { sincgars: ['AN/PRC-152'] });
const goldRadio = source('row-gold', 'equipment', 'prc-117', 'AN/PRC-117G');
const goldSat = source('row-gold', 'equipment', 'tsc-198', 'TSC-198');
const redRadio = source('row-red', 'equipment', 'prc-163', 'AN/PRC-163');
const brownFibre = source('row-brown', 'transport', 't1', 'Fibre A (Fiber)');

const BROWN = column('brown', '#8B4513', 'USA', [brownRadio, brownHawk, brownFibre]);
const GOLD = column('gold', '#C9A227', 'USN', [goldRadio, goldSat]);
// An organization with no colour and no branch.
const RED = column('red', '', '', [redRadio]);

const MODEL = model([BROWN, GOLD, RED], [
  row('waveform', 'sincgars', 'SINCGARS', 'Single Channel Radio', [[brownRadio, brownHawk], [goldRadio], [redRadio]]),
  row('waveform', 'anw2', 'ANW2', 'Adaptive Networking Wideband', [[brownRadio], [], []]),
  row('service', 'wgs', 'WGS', 'Wideband Global SATCOM', [[], [goldSat], []]),
  row('transport', 't1', 'Fibre A (Fiber)', '', [[brownFibre], [], []]),
]);

const drawn = (expanded: string[] = [], onToggleExpand = vi.fn()) =>
  render(<InteropMatrix model={MODEL} expanded={new Set(expanded)} onToggleExpand={onToggleExpand} />);

const rowOf = (label: string) => screen.getAllByRole('row').find((r) => within(r).queryByRole('rowheader')?.textContent?.startsWith(label))!;

describe('InteropMatrix', () => {
  it('draws one column per organization with its label, branch and expand toggle, and no Shared column', () => {
    drawn();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toHaveLength(4);
    expect(headers[0]).toBe('Capability');
    expect(headers[1]).toContain('BROWN');
    expect(headers[1]).toContain('USA');
    expect(headers[2]).toContain('GOLD');
    expect(headers[3]).toContain('RED');
    expect(screen.queryByText('Shared')).toBeNull();
    expect(screen.queryByTestId('interop-shared')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand BROWN' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('heads each section once, before its first row', () => {
    drawn();
    const captions = screen.getAllByRole('cell').map((c) => c.textContent).filter((t) => ['Waveforms', 'SATCOM services', 'Transports'].includes(t ?? ''));
    expect(captions).toEqual(['Waveforms', 'SATCOM services', 'Transports']);
  });

  it('omits the caption of a section no row has', () => {
    render(
      <InteropMatrix
        model={model([BROWN, GOLD], [row('waveform', 'anw2', 'ANW2', 'x', [[brownRadio], []])])}
        expanded={new Set()}
        onToggleExpand={vi.fn()}
      />,
    );
    expect(screen.getByText('Waveforms')).toBeInTheDocument();
    expect(screen.queryByText('SATCOM services')).toBeNull();
    expect(screen.queryByText('Transports')).toBeNull();
  });

  it('draws a cell as one chip per source, outlined in the organization colour, with the dash when empty', () => {
    drawn();
    const sincgars = within(rowOf('SINCGARS'));
    const chips = sincgars.getAllByText('AN/PRC-152');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveStyle({ borderColor: '#8B4513' });
    // BROWN gives SINCGARS twice: the first asset's chip, and a "+1" for the Hawk.
    expect(sincgars.queryByText('UH-60M')).toBeNull();
    expect(sincgars.getByRole('button', { name: 'Expand BROWN: UH-60M' })).toHaveStyle({ borderColor: '#8B4513' });
    expect(sincgars.getByText('AN/PRC-117G')).toHaveStyle({ borderColor: '#C9A227' });
    // ANW2 is empty for GOLD and RED.
    expect(within(rowOf('ANW2')).getAllByText(EMPTY_VALUE)).toHaveLength(2);
  });

  it('outlines a chip in amber when the organization has no colour', () => {
    drawn();
    expect(within(rowOf('SINCGARS')).getByText('AN/PRC-163').style.border).toContain('var(--shf-amber)');
    // And its pip is a graphite outline, not a fill.
    expect(screen.getAllByTestId('interop-pip')[2]!.style.border).toContain('var(--shf-graphite-600)');
  });

  it('titles a chip with its label, and a platform with the radios it carries a waveform through', async () => {
    const user = userEvent.setup();
    drawn();
    const sincgars = within(rowOf('SINCGARS'));
    await user.hover(sincgars.getByText('AN/PRC-152'));
    await waitFor(() => { expect(screen.getByRole('tooltip')).toHaveTextContent('AN/PRC-152'); });
    await user.unhover(sincgars.getByText('AN/PRC-152'));
    await user.hover(sincgars.getByRole('button', { name: 'Expand BROWN: UH-60M' }));
    await waitFor(() => { expect(screen.getByRole('tooltip')).toHaveTextContent('UH-60M via AN/PRC-152'); });
    // A platform that supplies the waveform itself has an empty via, and says nothing more.
    const own = row('waveform', 'sincgars', 'SINCGARS', '', [[source('row-brown', 'platform', 'uh-60', 'UH-60M', { sincgars: [] })], [], []]);
    render(<InteropMatrix model={model([BROWN, GOLD, RED], [own])} expanded={new Set()} onToggleExpand={vi.fn()} />);
    const hawks = screen.getAllByText('UH-60M');
    await user.hover(hawks[hawks.length - 1]!);
    await waitFor(() => { expect(screen.getByRole('tooltip')).toHaveTextContent(/^UH-60M$/); });
  });

  it('shows the app tooltip above a chip and leaves no native title inside the grid', async () => {
    const user = userEvent.setup();
    const { container } = drawn();
    await user.hover(within(rowOf('SINCGARS')).getByText('AN/PRC-152'));
    await waitFor(() => { expect(screen.getByRole('tooltip')).toHaveTextContent('AN/PRC-152'); });
    expect(container.querySelectorAll('[role=cell] [title]')).toHaveLength(0);
  });

  it('opens an expanded organization into one sub-column per asset, each with its kind, and a check where the asset gives the row', () => {
    drawn(['brown']);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(expect.arrayContaining(['AN/PRC-152radio', 'UH-60Mplatform', 'Fibre A (Fiber)transport']));
    expect(screen.getByRole('button', { name: 'Collapse BROWN' })).toHaveAttribute('aria-expanded', 'true');
    // The other organizations stay collapsed: still chips.
    expect(screen.getByRole('button', { name: 'Expand GOLD' })).toBeInTheDocument();
    expect(within(rowOf('SINCGARS')).getByText('AN/PRC-117G')).toBeInTheDocument();

    // SINCGARS: the radio and the Hawk, not the fibre. ANW2: the radio only. Fibre row: the fibre only.
    const checks = (label: string) => within(rowOf(label)).queryAllByTestId('matrix-check');
    expect(checks('SINCGARS')).toHaveLength(2);
    expect(checks('ANW2')).toHaveLength(1);
    expect(checks('Fibre A')).toHaveLength(1);
    expect(checks('SINCGARS')[0]).toHaveStyle({ color: '#8B4513' });
    // No chip for BROWN's assets any more: the sub-columns say it.
    expect(within(rowOf('SINCGARS')).queryByText('AN/PRC-152')).toBeNull();
  });

  it('puts the check on the right sub-column', () => {
    drawn(['brown']);
    const cells = within(rowOf('ANW2')).getAllByRole('cell');
    // The row's cells in order: BROWN radio, Hawk, fibre, then GOLD, RED.
    expect(within(cells[0]!).getByTestId('matrix-check')).toBeInTheDocument();
    expect(within(cells[1]!).getByText(EMPTY_VALUE)).toBeInTheDocument();
    expect(within(cells[2]!).getByText(EMPTY_VALUE)).toBeInTheDocument();
  });

  it('reports the toggle with the column key', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    drawn([], onToggleExpand);
    await user.click(screen.getByRole('button', { name: 'Expand GOLD' }));
    expect(onToggleExpand).toHaveBeenCalledWith('gold');
  });

  it('draws no per-phase strip and no N/M count anywhere', () => {
    drawn();
    expect(screen.queryByText(/by phase/)).toBeNull();
    expect(screen.queryByTitle(/ of /)).toBeNull();
    expect(screen.queryByText(/^\d+\/\d+$/)).toBeNull();
  });

  it('draws no Requirements, Reach or Talks to all row: the first section caption sits directly under the heads', () => {
    drawn();
    expect(screen.queryByText('Requirements')).toBeNull();
    expect(screen.queryByTestId('interop-reach')).toBeNull();
    expect(screen.queryByText('Reach')).toBeNull();
    expect(screen.queryByText('Talks to all')).toBeNull();
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('Waveforms');
  });

  it('says so when there is nothing to draw', () => {
    render(<InteropMatrix model={model([], [])} expanded={new Set()} onToggleExpand={vi.fn()} />);
    expect(screen.getByText('No waveforms to compare. Add waveforms to the Comms Library.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  describe('under a chosen phase', () => {
    // What the phase leaves is all the model holds: GOLD's satellite terminal and RED are not in it, so neither is drawn.
    const PHASED = model(
      [column('brown', '#8B4513', 'USA', [brownRadio]), column('gold', '#C9A227', 'USN', [goldRadio])],
      [row('waveform', 'sincgars', 'SINCGARS', 'Single Channel Radio', [[brownRadio], [goldRadio]])],
      'ph1',
    );
    const drawnPhased = (expanded: string[] = []) => render(
      <InteropMatrix model={PHASED} expanded={new Set(expanded)} onToggleExpand={vi.fn()} />,
    );

    it('draws only what is in the phase, with nothing dimmed, struck through or captioned as absent', () => {
      drawnPhased();
      expect(screen.getAllByRole('columnheader')).toHaveLength(3);
      expect(screen.queryByText('AN/PRC-163')).toBeNull();
      expect(screen.queryByText('TSC-198')).toBeNull();
      expect(screen.queryByText(/not in/)).toBeNull();
      for (const chip of within(rowOf('SINCGARS')).getAllByText(/^AN\/PRC/)) {
        expect(chip.style.opacity).toBe('');
        expect(chip.style.textDecoration).toBe('');
        expect(chip.style.borderStyle).not.toBe('dashed');
      }
    });

    it('opens an organization into the assets that are in the phase, each with a lit check where it gives the row', () => {
      drawnPhased(['gold']);
      const heads = screen.getAllByRole('columnheader').map((h) => h.textContent);
      expect(heads).toEqual(expect.arrayContaining(['AN/PRC-117Gradio']));
      expect(heads.some((h) => h?.startsWith('TSC-198'))).toBe(false);
      const checks = within(rowOf('SINCGARS')).getAllByTestId('matrix-check');
      expect(checks).toHaveLength(1);
      expect(checks[0]!.style.opacity).toBe('');
    });

    it('says nothing is in the phase when no organization is, rather than asking for waveforms', () => {
      render(<InteropMatrix model={model([], [], 'ph1')} expanded={new Set()} onToggleExpand={vi.fn()} />);
      expect(screen.getByText('Nothing is in this phase.')).toBeInTheDocument();
      expect(screen.queryByText(/Comms Library/)).toBeNull();
    });

    it('draws no "by phase" text anywhere', () => {
      drawnPhased();
      expect(screen.queryByText(/by phase/)).toBeNull();
    });
  });
});

describe('InteropMatrix read only', () => {
  it('draws the heads with no switch to open them, which a printed page has no use for', () => {
    render(<InteropMatrix model={MODEL} expanded={new Set()} onToggleExpand={vi.fn()} readOnly />);
    expect(screen.queryByRole('button', { name: /^(Expand|Collapse) / })).toBeNull();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Capability', 'BROWNUSA', 'GOLDUSN', 'RED']);
  });

  it('keeps the switch by default', () => {
    drawn();
    expect(screen.getAllByRole('button', { name: /^Expand [^:]+$/ })).toHaveLength(3);
  });

  describe('a collapsed cell with several sources', () => {
    const third = source('row-brown', 'equipment', 'prc-148', 'AN/PRC-148');
    const crowded = row('waveform', 'sincgars', 'SINCGARS', '', [[brownRadio, brownHawk, third], [], []]);
    const crowdedModel = model([BROWN, GOLD, RED], [crowded]);

    it('shows one chip and a +N button naming the rest', async () => {
      const user = userEvent.setup();
      render(<InteropMatrix model={crowdedModel} expanded={new Set()} onToggleExpand={vi.fn()} />);
      const cells = within(rowOf('SINCGARS'));
      expect(cells.getByText('AN/PRC-152')).toBeInTheDocument();
      expect(cells.queryByText('UH-60M')).toBeNull();
      expect(cells.queryByText('AN/PRC-148')).toBeNull();
      const more = cells.getByRole('button', { name: 'Expand BROWN: UH-60M, AN/PRC-148' });
      expect(more).toHaveTextContent('+2');
      await user.hover(more);
      await waitFor(() => { expect(screen.getByRole('tooltip')).toHaveTextContent('UH-60M via AN/PRC-152'); });
      expect(screen.getByRole('tooltip')).toHaveTextContent('AN/PRC-148');
    });

    it('opens the unit when the count is clicked', async () => {
      const onToggleExpand = vi.fn();
      render(<InteropMatrix model={crowdedModel} expanded={new Set()} onToggleExpand={onToggleExpand} />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Expand BROWN: UH-60M, AN/PRC-148' }));
      expect(onToggleExpand).toHaveBeenCalledWith('brown');
    });

    it('lists every chip and no count when read only', () => {
      render(<InteropMatrix model={crowdedModel} expanded={new Set()} onToggleExpand={vi.fn()} readOnly />);
      const cells = within(rowOf('SINCGARS'));
      expect(cells.getByText('AN/PRC-152')).toBeInTheDocument();
      expect(cells.getByText('UH-60M')).toBeInTheDocument();
      expect(cells.getByText('AN/PRC-148')).toBeInTheDocument();
      expect(cells.queryByText('+2')).toBeNull();
      expect(cells.queryByRole('button', { name: /^Expand BROWN:/ })).toBeNull();
    });

    it('shows no count on a cell with one source', () => {
      drawn();
      expect(within(rowOf('ANW2')).queryByText(/^\+\d/)).toBeNull();
    });
  });
});
