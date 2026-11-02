import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils';
import type { MatrixColumn } from './compat-matrix-model';
import {
  MatrixBannerToggles, MatrixColumnsPanel, MatrixFiltersPanel, MatrixFitReadout,
} from './matrix-panels';

function col(id: string, label: string): MatrixColumn {
  return {
    id, label, kind: 'platform', assetType: 'aircraft', branches: ['USA'], checkBranches: ['USA'],
  } as unknown as MatrixColumn;
}

describe('MatrixBannerToggles', () => {
  const base = {
    filtering: false, onToggleFiltering: vi.fn(), filterCount: 0,
    picking: true, onTogglePicking: vi.fn(), columnCount: 3 as number | null,
    omitEmptyRows: false, onToggleOmitEmptyRows: vi.fn(),
  };

  it('reflects pressed state and counts, and calls each handler', async () => {
    const user = userEvent.setup();
    const props = { ...base, filterCount: 2 };
    render(<MatrixBannerToggles {...props} />);
    const filters = screen.getByRole('button', { name: 'Filters (2)' });
    const columns = screen.getByRole('button', { name: 'Columns (3)' });
    const hide = screen.getByRole('button', { name: 'Hide empty rows' });
    expect(filters).toHaveAttribute('aria-pressed', 'false');
    expect(columns).toHaveAttribute('aria-pressed', 'true');
    await user.click(filters);
    await user.click(columns);
    await user.click(hide);
    expect(props.onToggleFiltering).toHaveBeenCalledTimes(1);
    expect(props.onTogglePicking).toHaveBeenCalledTimes(1);
    expect(props.onToggleOmitEmptyRows).toHaveBeenCalledTimes(1);
  });

  it('draws no count when there is none', () => {
    render(<MatrixBannerToggles {...base} columnCount={null} />);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Columns' })).toBeInTheDocument();
  });
});

describe('MatrixFiltersPanel', () => {
  it('renders the Branch row then its children, and Clear calls back', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const onToggleBranch = vi.fn();
    render(
      <MatrixFiltersPanel
        filterCount={1} onClear={onClear}
        availableBranches={['USA', 'USN']} branches={['USA']} onToggleBranch={onToggleBranch}
      >
        <div data-testid="extra">Type row</div>
      </MatrixFiltersPanel>,
    );
    const branch = screen.getByRole('group', { name: 'Branch' });
    expect(branch).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'USA' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'USN' })).toHaveAttribute('aria-pressed', 'false');
    expect(branch.compareDocumentPosition(screen.getByTestId('extra')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'USN' }));
    expect(onToggleBranch).toHaveBeenCalledWith('USN');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('MatrixColumnsPanel', () => {
  it('selects a whole group from its ALL tile and a single column from its chip', async () => {
    const user = userEvent.setup();
    const onSetColumns = vi.fn();
    render(
      <MatrixColumnsPanel
        groups={[{ label: 'USA', columns: [col('a', 'UH-60L'), col('b', 'AH-64')] }]}
        shownIds={['a']} allSelected={false} selectedCount={1}
        onSelectAll={vi.fn()} onClear={vi.fn()} onSetColumns={onSetColumns}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'All USA' }));
    expect(onSetColumns).toHaveBeenLastCalledWith(['a', 'b'], true);
    await user.click(screen.getByRole('button', { name: 'AH-64' }));
    expect(onSetColumns).toHaveBeenLastCalledWith(['b'], true);
    await user.click(screen.getByRole('button', { name: 'UH-60L' }));
    expect(onSetColumns).toHaveBeenLastCalledWith(['a'], false);
  });

  it('wires Select all and Clear', async () => {
    const user = userEvent.setup();
    const onSelectAll = vi.fn();
    const onClear = vi.fn();
    render(
      <MatrixColumnsPanel
        groups={[]} shownIds={[]} allSelected={false} selectedCount={1}
        onSelectAll={onSelectAll} onClear={onClear} onSetColumns={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('MatrixFitReadout', () => {
  it('toggles Fit and shows the full or shortened readout', async () => {
    const user = userEvent.setup();
    const onToggleFit = vi.fn();
    const { rerender } = render(<MatrixFitReadout readout="prints on 2 pages" fit={false} onToggleFit={onToggleFit} roomy />);
    expect(screen.getByText('prints on 2 pages')).toBeInTheDocument();
    const fit = screen.getByRole('button', { name: 'Fit to one page' });
    expect(fit).toHaveAttribute('aria-pressed', 'false');
    await user.click(fit);
    expect(onToggleFit).toHaveBeenCalledTimes(1);

    rerender(<MatrixFitReadout readout="prints on 2 pages" fit onToggleFit={onToggleFit} roomy={false} />);
    expect(screen.getByText('2 pages')).toHaveAttribute('title', 'prints on 2 pages');
    expect(screen.getByRole('button', { name: 'Fit to one page' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('draws no readout when given none', () => {
    render(<MatrixFitReadout readout={null} fit={false} onToggleFit={vi.fn()} />);
    expect(screen.queryByText(/^(prints on )?\d+ pages?$/)).not.toBeInTheDocument();
  });
});
