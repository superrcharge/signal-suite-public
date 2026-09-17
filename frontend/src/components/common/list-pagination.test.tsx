import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils';
import { ListPagination } from './list-pagination';

const base = {
  total: 24, noun: 'terminal', page: 2, totalPages: 3, onPrev: vi.fn(), onNext: vi.fn(),
};

describe('ListPagination', () => {
  it('counts on the right, pluralised, and pages on the left', async () => {
    const onPrev = vi.fn(); const onNext = vi.fn();
    render(<ListPagination {...base} onPrev={onPrev} onNext={onNext} />);
    expect(screen.getByText('24 terminals')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'previous page' }));
    await userEvent.click(screen.getByRole('button', { name: 'next page' }));
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('singular for one row, and no paging controls for none', () => {
    const { unmount } = render(<ListPagination {...base} total={1} totalPages={1} page={1} />);
    expect(screen.getByText('1 terminal')).toBeInTheDocument();
    unmount();
    render(<ListPagination {...base} total={0} totalPages={1} page={1} />);
    expect(screen.getByText('0 terminals')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'next page' })).not.toBeInTheDocument();
  });

  it('disables prev on the first page and next on the last', () => {
    render(<ListPagination {...base} page={1} totalPages={1} />);
    expect(screen.getByRole('button', { name: 'previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'next page' })).toBeDisabled();
  });

  it('offers page sizes only when given them, with 0 reading All', async () => {
    const onPageLimitChange = vi.fn();
    const { unmount } = render(
      <ListPagination {...base} pageLimit={50} pageSizeOptions={[25, 50, 0]} onPageLimitChange={onPageLimitChange} />,
    );
    expect(screen.getByRole('button', { name: '50' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onPageLimitChange).toHaveBeenCalledWith(0);
    unmount();
    render(<ListPagination {...base} />);
    expect(screen.queryByLabelText('Rows per page')).not.toBeInTheDocument();
  });
});
