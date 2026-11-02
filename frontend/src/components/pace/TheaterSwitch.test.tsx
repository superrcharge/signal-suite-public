import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TheaterSwitch } from './TheaterSwitch';

describe('TheaterSwitch', () => {
  it('names the group and presses the current theater', () => {
    render(<TheaterSwitch value="oconus" onChange={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Theater' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CONUS' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'OCONUS' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports the other theater on click, and nothing for the one already pressed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TheaterSwitch value="conus" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'OCONUS' }));
    expect(onChange).toHaveBeenCalledWith('oconus');

    await user.click(screen.getByRole('button', { name: 'CONUS' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
