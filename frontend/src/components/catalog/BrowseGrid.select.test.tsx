import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils';
import type { Equipment } from '@/types';
import { BrowseGrid } from './BrowseGrid';

const navigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useNavigate: () => navigate };
});

const item = (id: string, nomenclature: string): Equipment => ({
  id,
  nomenclature,
  terminal_type: 'radio',
  operational_mode: [],
  created_by: 'x',
  updated_by: 'x',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const alpha = item('alpha', 'AN/ALPHA-1');
const bravo = item('bravo', 'AN/BRAVO-2');

describe('BrowseGrid selection', () => {
  beforeEach(() => { navigate.mockClear(); });

  it('calls onSelect with the record and does not navigate', async () => {
    const onSelect = vi.fn();
    render(<BrowseGrid items={[alpha, bravo]} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('AN/BRAVO-2'));
    expect(onSelect).toHaveBeenCalledWith(bravo);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('selects from the keyboard with Enter and Space', async () => {
    const onSelect = vi.fn();
    render(<BrowseGrid items={[alpha]} onSelect={onSelect} />);
    const card = screen.getByRole('button', { name: /AN\/ALPHA-1/ });
    card.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('draws the badge and aria-pressed for selected ids only', () => {
    render(<BrowseGrid items={[alpha, bravo]} onSelect={vi.fn()} selectedIds={new Set(['alpha'])} />);
    const cards = screen.getAllByRole('button');
    expect(cards[0]).toHaveAttribute('aria-pressed', 'true');
    expect(cards[1]).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByTestId('card-selected-badge')).toHaveLength(1);
  });

  it('draws every card as a toggle with a 2px graphite-400 border when onSelect is given, amber once selected', () => {
    render(<BrowseGrid items={[alpha, bravo]} onSelect={vi.fn()} selectedIds={new Set(['alpha'])} />);
    const [selected, resting] = screen.getAllByRole('button');
    // Read off the attribute: jsdom does not decompose a side shorthand
    // that holds a var(), so the longhand properties read as empty.
    const css = (el: HTMLElement) => el.getAttribute('style') ?? '';
    for (const side of ['left', 'right', 'bottom']) {
      expect(css(resting!)).toContain(`border-${side}: 2px solid var(--shf-graphite-400)`);
      expect(css(selected!)).toContain(`border-${side}: 2px solid var(--shf-amber)`);
    }
    expect(css(resting!)).toContain('cursor: pointer');
    // The top keeps the catalog's amber rule either way.
    expect(css(resting!)).toContain('border-top: 3px solid var(--shf-amber)');
  });

  it('keeps the catalog hairline without onSelect', () => {
    render(<BrowseGrid items={[alpha]} />);
    const card = screen.getByText('AN/ALPHA-1').closest('div[style]')!.parentElement!.parentElement as HTMLElement;
    expect(card.getAttribute('style')).toContain('border-left: 1px solid var(--shf-graphite-600)');
    expect(card.getAttribute('style')).not.toContain('2px');
  });

  it('navigates to the datasheet without onSelect', async () => {
    render(<BrowseGrid items={[alpha]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('AN/ALPHA-1'));
    expect(navigate).toHaveBeenCalledWith('/catalog/alpha');
  });
});
