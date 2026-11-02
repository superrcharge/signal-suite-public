import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusIcon } from './status-icon';
import type { StatusKind } from './status-icon';

const KINDS: StatusKind[] = ['direct', 'relay', 'cannot', 'absent'];

describe('StatusIcon', () => {
  it.each(KINDS)('renders %s with its data-status', (kind) => {
    const { container } = render(<StatusIcon kind={kind} color="red" />);
    expect(container.querySelector(`[data-status="${kind}"]`)).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('is hidden from assistive tech without a label', () => {
    const { container } = render(<StatusIcon kind="direct" color="red" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('is an image with the given name when labelled', () => {
    render(<StatusIcon kind="relay" color="red" label="Relay via RED" />);
    expect(screen.getByRole('img', { name: 'Relay via RED' })).not.toHaveAttribute('aria-hidden');
  });

  it('keeps a fixed width of size + 2, whatever the kind', () => {
    const { container } = render(<><StatusIcon kind="direct" color="red" size={12} /><StatusIcon kind="absent" color="red" size={12} /></>);
    for (const el of Array.from(container.children)) expect(el).toHaveStyle({ width: '14px', height: '12px' });
  });
});
