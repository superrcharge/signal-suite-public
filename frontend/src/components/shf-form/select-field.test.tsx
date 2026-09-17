import { describe, expect, it, vi } from 'vitest';

import { render, screen, within } from '@/test/utils';
import { SHFSelectField } from './index';

/** Grouping was added for the PACE tier picker, which lists SATCOM terminals
 *  and radios together and gave no way to tell which kind was being chosen.
 *  The component is used across the app, so the ungrouped case is pinned here
 *  alongside the new one: it has to be purely additive. */
describe('SHFSelectField', () => {
  it('renders a flat list when no option names a group', () => {
    render(
      <SHFSelectField
        label="Kind"
        value=""
        onChange={vi.fn()}
        options={[{ value: 'a', label: 'Alpha' }, 'bravo']}
      />,
    );

    const select = screen.getByLabelText('Kind');
    expect(within(select).queryAllByRole('group')).toHaveLength(0);
    // The placeholder plus both options, with a bare string still usable as
    // its own value and label.
    expect(within(select).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['- select -', 'Alpha', 'bravo']);
  });

  it('buckets grouped options into optgroups in first-seen order', () => {
    render(
      <SHFSelectField
        label="Equipment"
        value=""
        onChange={vi.fn()}
        options={[
          { value: '1', label: 'AN/TSC-154(V)3', group: 'SATCOM terminals' },
          { value: '2', label: 'AN/PRC-158', group: 'Radios' },
          { value: '3', label: 'AN/TSC-198', group: 'SATCOM terminals' },
        ]}
      />,
    );

    const select = screen.getByLabelText('Equipment');
    const groups = within(select).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('label'))).toEqual(['SATCOM terminals', 'Radios']);
    // Declared order is preserved inside a group, so a caller orders its own
    // list rather than depending on the component to sort.
    expect(within(groups[0]!).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['AN/TSC-154(V)3', 'AN/TSC-198']);
    expect(within(groups[1]!).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['AN/PRC-158']);
  });

  it('keeps ungrouped options ahead of the groups', () => {
    render(
      <SHFSelectField
        label="Mixed"
        value=""
        onChange={vi.fn()}
        options={[
          { value: 'any', label: 'Any' },
          { value: '1', label: 'AN/PRC-158', group: 'Radios' },
        ]}
      />,
    );

    const select = screen.getByLabelText('Mixed');
    expect(within(select).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['- select -', 'Any', 'AN/PRC-158']);
    expect(within(select).getAllByRole('group')).toHaveLength(1);
  });
});
