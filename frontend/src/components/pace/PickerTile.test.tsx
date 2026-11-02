import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils';
import { PickerTile } from './SectionPicker';

describe('PickerTile', () => {
  it('renders the label and calls onOpen on click', async () => {
    const onOpen = vi.fn();
    render(<PickerTile label="Alpha" onOpen={onOpen} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /alpha/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows the dot and no image when there is no imageUrl', () => {
    render(<PickerTile label="Alpha" color="red" onOpen={vi.fn()} />);
    expect(screen.getByTestId('picker-tile-dot')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows the image instead of the dot when imageUrl is set', () => {
    render(<PickerTile label="Alpha" imageUrl="blob:emblem" onOpen={vi.fn()} />);
    expect(document.querySelector('img')).toHaveAttribute('src', 'blob:emblem');
    expect(screen.queryByTestId('picker-tile-dot')).toBeNull();
  });

  it('shows the caption only when given', () => {
    const { rerender } = render(<PickerTile label="Alpha" onOpen={vi.fn()} />);
    expect(screen.queryByText('3 nets')).toBeNull();
    rerender(<PickerTile label="Alpha" caption="3 nets" onOpen={vi.fn()} />);
    expect(screen.getByText('3 nets')).toBeInTheDocument();
  });

  it('renders the top label above the dot, in the label style, only when given', () => {
    const { rerender } = render(<PickerTile label="Alpha" onOpen={vi.fn()} />);
    expect(screen.queryByText('AS')).toBeNull();

    rerender(<PickerTile label="Alpha" topLabel="AS" onOpen={vi.fn()} />);
    const top = screen.getByText('AS');
    const dot = screen.getByTestId('picker-tile-dot');
    const label = screen.getByText('Alpha');
    // Document order is layout order in the tile's column: top label, dot, label.
    expect(top.compareDocumentPosition(dot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dot.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Same element shape and classes as the label, so it is the label's style, not the caption's.
    expect(top.tagName).toBe(label.tagName);
    expect(top.className).toBe(label.className);
  });
});
