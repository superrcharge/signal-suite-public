import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils';
import { ApiClientError } from '@/services/api-client';
import { OperationPicker } from './operation-picker';
import { useOperations } from '@/services';
import type { Operation } from '@/types';

const navigate = vi.fn();

vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: () => navigate,
}));

vi.mock('@/services', () => ({
  useOperations: vi.fn(),
}));

const mockUseOperations = vi.mocked(useOperations);

function op(over: Partial<Operation>): Operation {
  return {
    id: 'op-1',
    name: 'Operation Avalanche',
    acronym: '',
    status: 'planning',
    start_date: '',
    end_date: '',
    notes: '',
    created_by: '',
    updated_by: '',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    participant_count: 0,
    ...over,
  };
}

function returns(value: Partial<ReturnType<typeof useOperations>>) {
  mockUseOperations.mockReturnValue(value as ReturnType<typeof useOperations>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OperationPicker', () => {
  it('shows a spinner while loading', () => {
    returns({ data: undefined, isLoading: true, isError: false });
    render(<OperationPicker hrefFor={(id) => `/operations/${id}`} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('says so when there are no operations', () => {
    returns({ data: { operations: [], total: 0 }, isLoading: false, isError: false });
    render(<OperationPicker hrefFor={(id) => `/operations/${id}`} />);
    expect(screen.getByText('No operations yet')).toBeInTheDocument();
    expect(screen.getByText('Add one from the + menu or the button above.')).toBeInTheDocument();
  });

  it('shows the server message when the load fails', () => {
    returns({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiClientError('OPERATION_LIST_FAILED', 'Database unavailable'),
    });
    render(<OperationPicker hrefFor={(id) => `/operations/${id}`} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Database unavailable');
  });

  it('falls back to a generic message for a non-API error', () => {
    returns({ data: undefined, isLoading: false, isError: true, error: new Error('boom') });
    render(<OperationPicker hrefFor={(id) => `/operations/${id}`} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load operations');
  });

  it('puts the acronym above the dot and the name below it, both in the label style, with no dates or status', async () => {
    const user = userEvent.setup();
    returns({
      data: {
        operations: [
          op({ id: 'a', name: 'Operation Alpha Strike', acronym: 'AS', start_date: '2026-10-01', end_date: '2026-10-14' }),
          op({ id: 'b', name: 'Bravo', status: 'active' }),
        ],
        total: 2,
      },
      isLoading: false,
      isError: false,
    });
    render(<OperationPicker hrefFor={(id) => `/operations/${id}`} />);

    const acronym = screen.getByText('AS');
    const name = screen.getByText('Alpha Strike');
    const dot = screen.getAllByTestId('picker-tile-dot')[0] as HTMLElement;
    expect(acronym.compareDocumentPosition(dot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dot.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The name is a label, not the mono caption, and drops its leading "Operation".
    expect(name.className).toBe(acronym.className);
    expect(screen.queryByText('Operation Alpha Strike')).toBeNull();

    expect(screen.getByText('Bravo')).toBeInTheDocument();
    expect(screen.queryByText(/2026-10/)).toBeNull();
    expect(screen.queryByText(/Planning/)).toBeNull();
    expect(screen.queryByText(/Active/)).toBeNull();

    await user.click(acronym);
    expect(navigate).toHaveBeenCalledWith('/operations/a');
  });
});
