import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils';
import { ADD_VOCAB_VALUE, VocabField } from './VocabField';

/**
 * The control had no coverage in either of the two copies it existed as, which
 * is exactly why it was worth merging before anything else moves. Its whole
 * behaviour is a state machine with three branches nothing pinned: the sentinel
 * that swaps the select for a text box, the Escape that swaps it back, and the
 * appended custom value that stops the select silently blanking a record.
 */

const OPTS = ['fiber', 'cellular', 'manet'];

function setup(props: Partial<Parameters<typeof VocabField>[0]> = {}) {
  const onChange = vi.fn();
  render(
    <VocabField
      value=""
      options={OPTS}
      onChange={onChange}
      placeholder="New kind"
      {...props}
    />,
  );
  return { onChange, user: userEvent.setup() };
}

const optionTexts = () =>
  [...screen.getByRole('combobox').querySelectorAll('option')].map(o => o.textContent);

describe('VocabField', () => {
  it('offers the vocabulary plus the add entry, and no empty option by default', () => {
    setup();
    // Platform's configuration: category and kind always carry a value.
    expect(optionTexts()).toEqual(['fiber', 'cellular', 'manet', '+ Add new…']);
  });

  it('adds a leading empty option when emptyLabel is given', () => {
    setup({ emptyLabel: 'Not set' });
    // Transport's configuration: a transport may legitimately have no kind.
    expect(optionTexts()).toEqual(['Not set', 'fiber', 'cellular', 'manet', '+ Add new…']);
  });

  it('applies labelOf to the options but not to the add entry', () => {
    setup({ labelOf: v => v.toUpperCase(), addLabel: '+ Add new kind…' });
    // The add entry is not a value, so formatting it would be formatting a
    // control label - which is also what the help suite's written exception
    // keys on.
    expect(optionTexts()).toEqual(['FIBER', 'CELLULAR', 'MANET', '+ Add new kind…']);
  });

  it('swaps the select for a focused text box when the add entry is picked', async () => {
    const { onChange, user } = setup();

    await user.selectOptions(screen.getByRole('combobox'), ADD_VOCAB_VALUE);

    // Cleared first: the sentinel must never reach the caller as a value.
    expect(onChange).toHaveBeenCalledWith('');
    // The select is GONE, not merely joined by an input.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    const box = screen.getByPlaceholderText('New kind');
    expect(box).toHaveFocus();
  });

  it('returns to the select on Escape', async () => {
    const { onChange, user } = setup();

    await user.selectOptions(screen.getByRole('combobox'), ADD_VOCAB_VALUE);
    await user.keyboard('{Escape}');

    expect(onChange).toHaveBeenLastCalledWith('');
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('New kind')).not.toBeInTheDocument();
  });

  it('returns to the select on a blank blur', async () => {
    // Blur has two paths through one handler, and this is the reverting one:
    // picking the add entry and clicking away without typing should not strand
    // the reader in a text box.
    const { user } = setup();

    await user.selectOptions(screen.getByRole('combobox'), ADD_VOCAB_VALUE);
    await user.tab();

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('keeps a typed value on blur rather than discarding it', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    // Rendered mid-add by driving it there, since `adding` is internal.
    const { rerender } = render(
      <VocabField value="" options={OPTS} onChange={onChange} placeholder="New kind" />,
    );
    await user.selectOptions(screen.getByRole('combobox'), ADD_VOCAB_VALUE);
    rerender(
      <VocabField value="tropo" options={OPTS} onChange={onChange} placeholder="New kind" />,
    );

    await user.tab();

    expect(screen.getByPlaceholderText('New kind')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('appends a value the options do not carry, rather than blanking it', () => {
    // A custom kind on a saved record is not in the vocabulary until another
    // record uses it. Without the append the select would show the first
    // option instead, silently rewriting the record on the next save.
    setup({ value: 'troposcatter' });

    expect(optionTexts()).toEqual(['fiber', 'cellular', 'manet', 'troposcatter', '+ Add new…']);
    expect(screen.getByRole('combobox')).toHaveValue('troposcatter');
  });

  it('does not append a value the options already carry', () => {
    setup({ value: 'manet' });
    expect(optionTexts()).toEqual(['fiber', 'cellular', 'manet', '+ Add new…']);
  });

  it('capitalises only when asked', () => {
    const { unmount } = render(
      <VocabField value="" options={OPTS} onChange={vi.fn()} placeholder="x" capitalize />,
    );
    expect(screen.getByRole('combobox')).toHaveStyle({ textTransform: 'capitalize' });
    unmount();

    render(<VocabField value="" options={OPTS} onChange={vi.fn()} placeholder="x" />);
    expect(screen.getByRole('combobox')).not.toHaveStyle({ textTransform: 'capitalize' });
  });
});
