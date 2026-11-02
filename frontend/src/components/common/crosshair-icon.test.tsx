import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils';
import { CrosshairIcon } from './crosshair-icon';

describe('CrosshairIcon', () => {
  it('draws a ring, a cross and a centre dot', () => {
    const { container } = render(<CrosshairIcon data-testid="crosshair" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('data-testid')).toBe('crosshair');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg?.querySelectorAll('circle')).toHaveLength(2);
    expect(svg?.querySelectorAll('line')).toHaveLength(2);
  });

  it('takes its colour from the surrounding text', () => {
    const { container } = render(<CrosshairIcon />);
    const strokes = Array.from(container.querySelectorAll('[stroke]')).map((e) => e.getAttribute('stroke'));
    expect(new Set(strokes)).toEqual(new Set(['currentColor']));
  });
});
