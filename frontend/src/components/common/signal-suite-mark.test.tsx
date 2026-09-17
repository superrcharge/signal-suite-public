import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils';
import { SignalSuiteMark, SIGNAL_SUITE_AMBER, SIGNAL_SUITE_VIEWBOX } from './signal-suite-mark';

const mark = () => screen.getByRole('img', { name: 'Signal Suite' });

describe('SignalSuiteMark', () => {
  it('is an image named Signal Suite that reads SIGNAL then SUITE', () => {
    render(<SignalSuiteMark />);
    expect(mark()).toHaveTextContent(/^SIGNAL SUITE$/);
  });

  it('draws SUITE in amber whatever the SIGNAL colour', () => {
    render(<SignalSuiteMark color="#0A0A0A" />);
    expect(mark().querySelector('text')?.getAttribute('fill')).toBe('#0A0A0A');
    expect(mark().querySelector('tspan')?.getAttribute('fill')).toBe(SIGNAL_SUITE_AMBER);
  });

  it('is the wordmark alone, with no bars after it', () => {
    render(<SignalSuiteMark />);
    expect(mark().querySelectorAll('rect, g')).toHaveLength(0);
  });

  it('ends its box at the word, so the header aligns the ink', () => {
    // The word's ink ends at 303.2 units, measured in a browser with Oswald
    // loaded. A box wider than that puts blank canvas at the right edge, which
    // the header then right-justifies instead of the word.
    const width = Number(SIGNAL_SUITE_VIEWBOX.split(' ')[2]);
    expect(width).toBeGreaterThanOrEqual(303.2);
    expect(width).toBeLessThan(310);
  });

  it('renders at the header size by default, at the box aspect ratio', () => {
    render(<SignalSuiteMark />);
    expect(mark().getAttribute('width')).toBe('114');
    expect(mark().getAttribute('height')).toBe('27');
    const [w = 0, h = 1] = SIGNAL_SUITE_VIEWBOX.split(' ').slice(2).map(Number);
    expect(Math.round((27 * w) / h)).toBe(114);
  });
});
