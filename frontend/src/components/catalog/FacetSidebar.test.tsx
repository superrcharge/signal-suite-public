import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils';
import { FacetSidebar } from './FacetSidebar';
import type { FacetModel } from './facet-selection';

const noop = () => {};

function model(over: Partial<FacetModel> & Pick<FacetModel, 'facet' | 'label'>): FacetModel {
  return {
    scope: 'satcom', values: [], presets: [], range: null, span: null,
    blank: { count: 0, selected: false }, naCount: 0, activeCount: 0, discriminates: true,
    ...over,
  };
}

const weight = (range: FacetModel['range']) => model({
  facet: { id: 'weight', param: 'swap:weight', kind: 'range' },
  label: 'Weight', unit: 'lbs', range, activeCount: range ? 1 : 0,
  presets: [
    { label: 'Under 20', min: null, max: 20, count: 4, selected: false },
    { label: '20 – 50', min: 20, max: 50, count: 2, selected: false },
  ],
});

const bands = model({
  facet: { id: 'band', param: 'std:band', kind: 'value' },
  label: 'Bands',
  values: [
    { key: 'ka', label: 'Ka', count: 4, selected: false },
    { key: 'ku', label: 'Ku', count: 2, selected: true },
  ],
});

function renderRail(models: FacetModel[]) {
  const onSetRange = vi.fn();
  render(
    <FacetSidebar
      models={models}
      appliedCount={0}
      shownCount={10}
      paused={[]}
      onToggleValue={noop}
      onToggleBlank={noop}
      onSetRange={onSetRange}
      onClearAll={noop}
      onClearTerm={noop}
      onClearPaused={noop}
      expanded={new Set(models.map(m => m.facet.id))}
      expandedTails={new Set()}
      onToggleCollapsed={noop}
      onToggleTail={noop}
      onSetAllExpanded={noop}
    />,
  );
  return onSetRange;
}

describe('FacetSidebar range control', () => {
  it('offers a clear control only while a custom threshold is applied, and clears through onSetRange', async () => {
    const onSetRange = renderRail([weight({ min: null, max: 40 })]);
    const clear = screen.getByRole('button', { name: 'Clear custom threshold, Weight' });
    expect(screen.getByLabelText('Under')).toHaveValue(40);
    await userEvent.click(clear);
    expect(onSetRange).toHaveBeenCalledWith('weight', null, null);
  });

  it('shows no clear control with nothing applied', () => {
    renderRail([weight(null)]);
    expect(screen.queryByRole('button', { name: /Clear custom threshold/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Under')).toHaveValue(null);
  });
});

describe('FacetSidebar chips', () => {
  it('lays value chips out in a grid and titles each with its full label', () => {
    renderRail([bands]);
    const ka = screen.getByRole('button', { name: 'Ka, 4 results' });
    expect(ka).toHaveAttribute('title', 'Ka');
    expect(ka.parentElement?.style.display).toBe('grid');
    expect(screen.getByRole('button', { name: 'Ku, 2 results' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lays range presets out in the same grid', () => {
    renderRail([weight(null)]);
    const preset = screen.getByRole('button', { name: 'Under 20 lbs, 4 results' });
    expect(preset.parentElement?.style.display).toBe('grid');
  });
});
