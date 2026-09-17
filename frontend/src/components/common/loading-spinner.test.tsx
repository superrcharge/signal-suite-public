import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import { LoadingSpinner } from './loading-spinner';

describe('LoadingSpinner', () => {
  it('should render a loading indicator', () => {
    render(<LoadingSpinner />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('should display a message when provided', () => {
    render(<LoadingSpinner message="Loading data..." />);

    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('should render fullscreen when fullScreen prop is true', () => {
    const { container } = render(<LoadingSpinner fullScreen />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveStyle({ position: 'fixed' });
  });

  it('should not render message when not provided', () => {
    render(<LoadingSpinner />);

    expect(screen.queryByRole('status')?.children.length).toBe(1);
  });
});
