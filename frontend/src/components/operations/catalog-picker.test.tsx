import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, within } from '@/test/utils';
import type { Equipment } from '@/types';
import { CatalogPicker } from './catalog-picker';

const stamps = { created_by: 't', updated_by: 't', created_at: '', updated_at: '' };
const EQUIPMENT: Equipment[] = [
  { id: 'tsc-198', nomenclature: 'AN/TSC-198', nickname: 'Phoenix', make: 'L3Harris', terminal_type: 'satcom', operational_mode: [], ...stamps },
  { id: 'prc-117', nomenclature: 'AN/PRC-117G', nickname: 'Manpack', make: 'L3Harris', terminal_type: 'radio', operational_mode: [], ...stamps },
  { id: 'prc-152', nomenclature: 'AN/PRC-152', nickname: '', make: 'Thales', terminal_type: 'radio', operational_mode: [], ...stamps },
];

vi.mock('@/services', () => ({
  useEquipment: () => ({ data: { equipment: EQUIPMENT, total: EQUIPMENT.length }, isLoading: false }),
}));

const setup = (selected: string[] = [], onToggle = vi.fn()) => {
  render(<CatalogPicker selectedIds={new Set(selected)} onToggle={onToggle} />);
  return { user: userEvent.setup(), onToggle };
};

// A card is a pressable button; the tray's Remove button names the record too but is never pressable.
const card = (name: string, pressed: boolean) => screen.queryByRole('button', { name: new RegExp(name), pressed });
const tray = () => within(screen.getByRole('group', { name: 'Bringing' }));

describe('CatalogPicker', () => {
  it('renders a card per catalog record', () => {
    setup();
    expect(screen.getByText('AN/TSC-198')).toBeInTheDocument();
    expect(screen.getByText('AN/PRC-117G')).toBeInTheDocument();
    expect(screen.getByText('AN/PRC-152')).toBeInTheDocument();
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
  });

  it('calls onToggle with the id of a clicked card', async () => {
    const { user, onToggle } = setup();
    await user.click(screen.getByText('AN/PRC-152'));
    expect(onToggle).toHaveBeenCalledWith('prc-152');
  });

  it('draws a selected card with its badge and lists it in the tray', () => {
    setup(['prc-117']);
    expect(card('AN/PRC-117G', true)).toBeInTheDocument();
    expect(card('AN/TSC-198', false)).toBeInTheDocument();
    expect(screen.getByTestId('card-selected-badge')).toBeInTheDocument();
    expect(tray().getByText('Bringing (1)')).toBeInTheDocument();
    expect(tray().getByText('AN/PRC-117G')).toBeInTheDocument();
    expect(tray().queryByText('Nothing picked yet. Click a card to bring it.')).not.toBeInTheDocument();
  });

  it('says nothing is picked when the selection is empty', () => {
    setup();
    expect(tray().getByText('Bringing (0)')).toBeInTheDocument();
    expect(tray().getByText('Nothing picked yet. Click a card to bring it.')).toBeInTheDocument();
  });

  it('removes a pick from the tray with its × button', async () => {
    const { user, onToggle } = setup(['prc-117']);
    await user.click(tray().getByRole('button', { name: 'Remove AN/PRC-117G' }));
    expect(onToggle).toHaveBeenCalledWith('prc-117');
  });

  it('keeps a pick in the tray when the search narrows it out of the grid', async () => {
    const { user } = setup(['prc-117']);
    await user.type(screen.getByPlaceholderText(/Search by name/), 'TSC-198');
    expect(card('AN/PRC-117G', true)).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(tray().getByText('AN/PRC-117G')).toBeInTheDocument();
  });

  it('narrows to SATCOM terminals from the tab chip', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'SATCOM' }));
    expect(screen.getByText('AN/TSC-198')).toBeInTheDocument();
    expect(screen.queryByText('AN/PRC-117G')).not.toBeInTheDocument();
    expect(screen.queryByText('AN/PRC-152')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('mounts the facet rail from the Filters button', async () => {
    const { user } = setup();
    expect(screen.queryByRole('complementary', { name: 'Filters' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const rail = screen.getByRole('complementary', { name: 'Filters' });
    expect(rail.style.height).toBe('60vh');
    expect(within(rail).getByText('Manufacturer')).toBeInTheDocument();
  });

  it('draws a selected id the catalog no longer holds struck through, and still removable', async () => {
    const { user, onToggle } = setup(['gone-1']);
    const chip = tray().getByText('gone-1');
    expect(chip.style.textDecoration).toBe('line-through');
    expect(chip).toHaveAttribute('title', 'This catalog record no longer exists');
    await user.click(tray().getByRole('button', { name: 'Remove gone-1' }));
    expect(onToggle).toHaveBeenCalledWith('gone-1');
  });
});
