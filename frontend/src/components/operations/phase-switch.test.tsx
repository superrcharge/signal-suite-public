import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, within } from '@/test/utils';
import type { Phase } from '@/types';
import { PhaseSwitch } from './phase-switch';

const phase = (id: string, position: number, name: string): Phase => ({
  id, operation_id: 'op-1', position, name, supported_participant_id: null, placements: {}, requirements: [],
});
const PHASES = [phase('b', 2, 'Phase II'), phase('a', 1, 'Phase I'), phase('c', 3, 'Phase III')];

describe('PhaseSwitch', () => {
  it('draws All phases first, then a chip per phase in position order, in a Phase group', () => {
    render(<PhaseSwitch phases={PHASES} value={null} onChange={vi.fn()} />);
    const group = within(screen.getByRole('group', { name: 'Phase' }));
    expect(group.getAllByRole('button').map((b) => b.textContent)).toEqual(['All phases', 'Phase I', 'Phase II', 'Phase III']);
  });

  it('presses the chip the value names, and All phases for null', () => {
    const { rerender } = render(<PhaseSwitch phases={PHASES} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'All phases' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Phase II' })).toHaveAttribute('aria-pressed', 'false');
    rerender(<PhaseSwitch phases={PHASES} value="b" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'All phases' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Phase II' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports the phase id, and null for All phases, and says nothing when the pressed chip is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhaseSwitch phases={PHASES} value="a" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Phase III' }));
    expect(onChange).toHaveBeenLastCalledWith('c');
    await user.click(screen.getByRole('button', { name: 'All phases' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    onChange.mockClear();
    await user.click(screen.getByRole('button', { name: 'Phase I' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves out All phases when told the view is always about one', () => {
    render(<PhaseSwitch phases={PHASES} value="a" onChange={vi.fn()} allPhases={false} />);
    const group = within(screen.getByRole('group', { name: 'Phase' }));
    expect(group.getAllByRole('button').map((b) => b.textContent)).toEqual(['Phase I', 'Phase II', 'Phase III']);
  });

  it('draws nothing for one phase or none', () => {
    const { container, rerender } = render(<PhaseSwitch phases={[phase('a', 1, 'Phase I')]} value={null} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PhaseSwitch phases={[]} value={null} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
