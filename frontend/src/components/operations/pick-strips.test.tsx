import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Transport } from '@/types';
import { TransportStrip } from './pick-strips';

function make(n: number): Transport[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Link ${i}`,
    kind: 'fiber',
    provider: '',
    description: '',
    owned_by: '',
    owner_country: '',
    created_by: '',
    updated_by: '',
    created_at: '',
    updated_at: '',
  }));
}

function patch(list: Transport[], changes: Record<number, Partial<Transport>>): Transport[] {
  return list.map((t, i) => ({ ...t, ...changes[i] }));
}

function Harness({ transports, initial = [], onToggle, collapsible }: { transports: Transport[]; initial?: string[]; onToggle?: (id: string) => void; collapsible?: boolean }) {
  const [picked, setPicked] = useState(initial);
  return (
    <TransportStrip
      transports={transports}
      picked={picked}
      collapsible={collapsible}
      onToggle={id => { onToggle?.(id); setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id])); }}
    />
  );
}

const header = () => screen.getByRole('button', { name: /^Transports/ });

describe('TransportStrip', () => {
  it('is collapsed by default', () => {
    render(<Harness transports={make(3)} />);
    expect(header()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Transports' })).toBeNull();
  });

  it('collapsed shows only picked chips and the caption', () => {
    const t = make(3);
    render(<Harness transports={t} initial={['t1']} />);
    expect(screen.getByText('1 picked of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Link 1/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Link 0/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Link 2/ })).toBeNull();
  });

  it('Show all expands the list', async () => {
    const user = userEvent.setup();
    render(<Harness transports={make(3)} />);
    expect(screen.getByText(/None picked\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show all 3' }));
    expect(header()).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('group', { name: 'Transports' })).getAllByRole('button')).toHaveLength(3);
  });

  it('expanded shows every transport', async () => {
    const user = userEvent.setup();
    render(<Harness transports={make(4)} initial={['t0']} />);
    await user.click(header());
    expect(within(screen.getByRole('group', { name: 'Transports' })).getAllByRole('button')).toHaveLength(4);
  });

  it('shows the search whenever expanded, even for a small library', async () => {
    const user = userEvent.setup();
    render(<Harness transports={make(2)} />);
    expect(screen.queryByRole('textbox', { name: 'Search transports' })).toBeNull();
    await user.click(header());
    expect(screen.getByRole('textbox', { name: 'Search transports' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
  });

  it('lists transports alphabetically by name', async () => {
    const user = userEvent.setup();
    const t = patch(make(3), { 0: { name: 'zulu' }, 1: { name: 'Alpha' }, 2: { name: 'bravo' } });
    render(<Harness transports={t} />);
    await user.click(header());
    const names = within(screen.getByRole('group', { name: 'Transports' })).getAllByRole('button').map(b => b.getAttribute('aria-label'));
    expect(names).toEqual(['Alpha (Fiber)', 'bravo (Fiber)', 'zulu (Fiber)']);
  });

  it('matches a multi-word query across name, provider and country, and keeps picked rows', async () => {
    const user = userEvent.setup();
    const t = patch(make(4), { 1: { name: 'Orange 5G', kind: 'cellular', provider: 'Orange', owner_country: 'France' } });
    render(<Harness transports={t} initial={['t3']} />);
    await user.click(header());
    const box = screen.getByRole('textbox', { name: 'Search transports' });
    await user.type(box, 'orange cellular');
    const group = screen.getByRole('group', { name: 'Transports' });
    expect(within(group).getByRole('button', { name: /Orange 5G/ })).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: /Link 0/ })).toBeNull();
    // picked row stays visible under a non-matching query
    expect(within(group).getByRole('button', { name: /Link 3/ })).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, 'france');
    expect(within(group).getByRole('button', { name: /Orange 5G/ })).toBeInTheDocument();
    expect(within(group).queryByRole('button', { name: /Link 2/ })).toBeNull();
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Harness transports={make(3)} />);
    await user.click(header());
    await user.type(screen.getByRole('textbox', { name: 'Search transports' }), 'nope');
    expect(screen.getByText('No transport matches "nope".')).toBeInTheDocument();
    expect(screen.getByText('0 of 3')).toBeInTheDocument();
  });

  it('a row name is exactly the transport label, with detail described separately', async () => {
    const user = userEvent.setup();
    const t = patch(make(2), { 0: { provider: 'Orange', owner_country: 'France' } });
    render(<Harness transports={t} />);
    await user.click(header());
    const row = within(screen.getByRole('group', { name: 'Transports' })).getByRole('button', { name: 'Link 0 (Fiber)' });
    expect(row).toHaveAccessibleDescription('Orange \u00b7 France');
  });

  it('toggling a chip calls onToggle and does not collapse', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<Harness transports={make(3)} onToggle={onToggle} />);
    await user.click(header());
    await user.click(within(screen.getByRole('group', { name: 'Transports' })).getByRole('button', { name: /Link 2/ }));
    expect(onToggle).toHaveBeenCalledWith('t2');
    expect(header()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Transports' })).toBeInTheDocument();
  });

  it('collapsible={false} shows the search and the list at once, with no header button', () => {
    render(<Harness transports={make(3)} collapsible={false} />);
    expect(screen.queryByRole('button', { name: /^Transports/ })).toBeNull();
    expect(screen.getByText('Transports')).toBeInTheDocument();
    expect(screen.getByText('0 picked of 3')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search transports' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Transports' })).getAllByRole('button')).toHaveLength(3);
  });
});
