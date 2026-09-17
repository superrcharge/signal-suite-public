import { describe, expect, it } from 'vitest';

import { render, screen, within } from '@/test/utils';
import { ChannelWheel, type WheelChannelAssignment } from './ChannelWheel';
import { SHEET_CHANGED } from './pace-constants';

const ASSIGNMENTS: WheelChannelAssignment[] = [
  { channel: 1, netName: 'NET 1', netId: 'N01', txFreq: '31.6875', rxFreq: '31.6875', freqUnit: 'MHz' },
  { channel: 5, netName: 'NET 2', netId: 'N02', txFreq: '38.25', rxFreq: '48.75', freqUnit: 'MHz' },
  { channel: 12, netName: 'NET 3', netId: 'N03', txFreq: 'TBD', freqUnit: 'MHz' },
];

function renderWheel(props: Partial<Parameters<typeof ChannelWheel>[0]> = {}) {
  return render(
    <ChannelWheel title="JEM channel wheel" assignments={ASSIGNMENTS} {...props} />,
  );
}

/** The SVG <text> whose content is exactly `s`. */
function svgText(s: string): SVGTextElement {
  const hit = Array.from(screen.getByRole('img').querySelectorAll('text')).find((t) => t.textContent === s);
  if (!hit) throw new Error(`no SVG text "${s}"`);
  return hit;
}

describe('ChannelWheel changed marks', () => {
  it('draws a marked TX line red and leaves its RX line alone', () => {
    renderWheel({
      assignments: [{ channel: 5, netName: 'NET 2', txFreq: '38.25', rxFreq: '48.75', freqUnit: 'MHz', highlights: ['tx'] }],
    });
    expect(svgText('TX 38.25').getAttribute('fill')).toBe(SHEET_CHANGED);
    expect(svgText('RX 48.75 MHz').getAttribute('fill')).toBe('currentColor');
    expect(svgText('NET 2').getAttribute('fill')).toBe('currentColor');
  });

  it('draws a shared frequency red when either half is marked', () => {
    // A simplex net prints one line for both, so a mark on RX alone is still
    // a change to the one figure on the wheel.
    renderWheel({
      assignments: [{ channel: 1, netName: 'NET 1', txFreq: '31.6875', rxFreq: '31.6875', freqUnit: 'MHz', highlights: ['rx'] }],
    });
    expect(svgText('31.6875 MHz').getAttribute('fill')).toBe(SHEET_CHANGED);
  });

  it('draws a marked net name and caption red', () => {
    renderWheel({
      caption: 'JEM',
      captionMarked: true,
      assignments: [{ channel: 3, netName: 'NET 3', highlights: ['net'] }],
    });
    expect(svgText('NET 3').getAttribute('fill')).toBe(SHEET_CHANGED);
    expect(svgText('JEM').getAttribute('fill')).toBe(SHEET_CHANGED);
  });

  it('says "changed" in the accessible table, where red cannot reach', () => {
    renderWheel({
      assignments: [{ channel: 3, netName: 'NET 3', txFreq: '40', freqUnit: 'MHz', highlights: ['net', 'tx'] }],
    });
    const rows = within(screen.getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true });
    const cells = within(rows[3]!).getAllByRole('cell', { hidden: true });
    expect(cells[0]).toHaveTextContent('NET 3 (changed)');
    expect(cells[2]).toHaveTextContent('(changed)');
  });
});

describe('ChannelWheel', () => {
  it('renders every channel, assigned or not', () => {
    renderWheel();
    const table = screen.getByRole('table', { hidden: true });
    // 16 channels plus the header row.
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(17);
  });

  it('shows a placeholder on channels with no net', () => {
    renderWheel();
    // 16 positions, 3 assigned -> 13 placeholders, in both the SVG and the table.
    expect(screen.getAllByText('UNASSIGNED').length).toBe(13 * 2);
  });

  it('honours a custom placeholder label', () => {
    renderWheel({ unassignedLabel: 'OPEN' });
    expect(screen.queryByText('UNASSIGNED')).toBeNull();
    expect(screen.getAllByText('OPEN').length).toBeGreaterThan(0);
  });

  it('collapses a simplex net to a single figure', () => {
    renderWheel();
    expect(screen.getAllByText('31.6875 MHz').length).toBeGreaterThan(0);
  });

  it('keeps the net ID off the wheel', () => {
    // The dial answers "what is on this channel"; the name and frequency do
    // that. The ID stays in the Nets Library and the accessible table.
    renderWheel();
    const svg = screen.getByRole('img');
    expect(svg.textContent).not.toContain('N01');
  });

  it('carries the net ID in the accessible table', () => {
    // The other half of the rule above: the dial omits the ID, so this column
    // is the only place a screen reader can reach it. It read blank on every
    // row for as long as the pages mapped every field except netId, and
    // nothing here failed, because no test had ever asserted the column
    // was populated - only that the ID stayed off the SVG.
    renderWheel();
    const rows = within(screen.getByRole('table', { hidden: true })).getAllByRole('row', {
      hidden: true,
    });

    for (const { channel, netId } of ASSIGNMENTS) {
      // The channel number is a row header, so the cells are Net, Channel #,
      // Frequency. Row 0 is the header row, so channel N is row N.
      const cells = within(rows[channel]!).getAllByRole('cell', { hidden: true });
      expect(cells[1]).toHaveTextContent(netId!);
    }

    // An unassigned position still has the cell, just nothing in it.
    const unassigned = within(rows[2]!).getAllByRole('cell', { hidden: true });
    expect(unassigned[1]!.textContent).toBe('');
  });

  it('breaks TX and RX onto separate lines when they differ', () => {
    // One line is the widest thing on the sheet; two lines is what lets the
    // wheel be drawn larger.
    renderWheel();
    expect(screen.getAllByText('TX 38.25').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RX 48.75 MHz').length).toBeGreaterThan(0);
  });

  it('omits the unit for a non-numeric frequency', () => {
    renderWheel();
    // "TBD MHz" would be nonsense on a printed wheel.
    expect(screen.queryByText(/TBD MHz/)).toBeNull();
    expect(screen.getAllByText(/TX TBD/).length).toBeGreaterThan(0);
  });

  it('exposes the wheel to assistive tech and carries the real content in a table', () => {
    renderWheel();
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('aria-label', expect.stringContaining('3 of 16'));

    const table = screen.getByRole('table', { hidden: true });
    expect(within(table).getByText('JEM channel wheel')).toBeInTheDocument();
  });

  it('renders a caption only when given one', () => {
    const { unmount } = renderWheel({ caption: 'JEM' });
    expect(screen.getByText('JEM')).toBeInTheDocument();
    unmount();

    renderWheel();
    expect(screen.queryByText('JEM')).toBeNull();
  });

  it('renders the emblem only when a url is supplied', () => {
    const { container, unmount } = renderWheel();
    expect(container.querySelector('image')).toBeNull();
    unmount();

    const { container: withEmblem } = renderWheel({ emblemUrl: 'data:image/svg+xml,x' });
    expect(withEmblem.querySelector('image')).not.toBeNull();
  });

  it('is a pure render: no interactive handlers anywhere in the SVG', () => {
    const { container } = renderWheel();
    // Editing happens on a form, never on the picture. A click handler appearing
    // here would mean the wheel had grown editing behaviour.
    expect(container.querySelector('svg button')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
    expect(container.querySelectorAll('svg a')).toHaveLength(0);
  });

  it('respects a channel count other than 16', () => {
    render(<ChannelWheel title="Test" assignments={[]} channelCount={12} />);
    const table = screen.getByRole('table', { hidden: true });
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(13);
  });

  describe('the top axis label', () => {
    // Channel 9 at 16 positions. Its block hangs back TOWARD the dial, so the
    // geometry reserves room for the worst case -- a separate TX and RX line --
    // before it knows what net will sit there. A net carrying fewer lines is
    // nudged back down by the ones it is not using, or it floats: 19 units off
    // its own tick against the bottom axis label's 0.
    const yOf = (container: HTMLElement, text: string) =>
      Number(
        Array.from(container.querySelectorAll('text'))
          .find((t) => t.textContent === text)
          ?.getAttribute('y'),
      );

    const at9 = (a: Partial<WheelChannelAssignment>) =>
      renderWheel({ assignments: [{ channel: 9, netName: 'TOP', ...a }] });

    it('places a two-line net at the reserved radius', () => {
      // Nothing to give back: this is the case the reservation is for.
      const { container } = at9({ txFreq: '30.5', rxFreq: '40.5', freqUnit: 'MHz' });
      expect(yOf(container, 'TOP')).toBeCloseTo(35, 6);
    });

    it('drops a one-line net by the line it is not using', () => {
      const { container } = at9({ txFreq: '30.5', rxFreq: '30.5', freqUnit: 'MHz' });
      expect(yOf(container, 'TOP')).toBeCloseTo(35 + 12.6, 6);
    });

    it('drops a net with no frequency by both', () => {
      const { container } = at9({});
      expect(yOf(container, 'TOP')).toBeCloseTo(35 + 25.2, 6);
    });

    it('leaves the bottom axis label alone, whatever it carries', () => {
      // It hangs away from the dial, so it sits flush at any line count and has
      // nothing to give back.
      const one = renderWheel({
        assignments: [{ channel: 1, netName: 'BOT', txFreq: '30.5', rxFreq: '30.5', freqUnit: 'MHz' }],
      });
      expect(yOf(one.container, 'BOT')).toBeCloseTo(365, 6);
      one.unmount();

      const two = renderWheel({
        assignments: [{ channel: 1, netName: 'BOT', txFreq: '30.5', rxFreq: '40.5', freqUnit: 'MHz' }],
      });
      expect(yOf(two.container, 'BOT')).toBeCloseTo(365, 6);
    });
  });

  it('keeps the hidden table from widening the page', () => {
    // It is the real content for a screen reader, so it holds every channel's
    // net and frequency and lays out around 486px wide if left to itself. An
    // auto-layout table ignores a width narrower than its content, so the 1px in
    // the visually-hidden style did not bind: the table escaped the figure and
    // gave the whole document a horizontal scrollbar on any window narrower than
    // that, with nothing visible out there to explain it.
    const { container } = renderWheel();
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(getComputedStyle(table!).tableLayout).toBe('fixed');
  });

  it('drops the caption baseline clear of the amber ring band', () => {
    // Measured DOWN from the band's inner edge, not up from the hub, which put
    // the words' cap height inside the band and struck the ring through them.
    // Found by textContent rather than by a text-anchor selector, because the
    // channel numbers are centred too.
    const { container } = renderWheel({ caption: 'JEM' });
    const caption = Array.from(container.querySelectorAll('text')).find(
      (t) => t.textContent === 'JEM',
    );
    expect(caption).toBeDefined();
    expect(caption).toHaveAttribute('y', '124');
  });
});
