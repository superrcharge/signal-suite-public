import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor, within } from '@/test/utils';
import { ApiClientError } from '@/services/api-client';
import { LibInput, NameAndDesc, ReferenceLibraryPane, UsageCount, UsageNames } from './ReferenceLibraryPane';

/**
 * Rendered directly rather than through the Comms Library page, for the same
 * reason catalog-editor-page.test.tsx renders EquipmentFormPane directly: the
 * branches that matter here - a write REJECTING, a confirm being declined, a
 * pane with no field grid - are unreachable from a page whose mutation doubles
 * always resolve.
 *
 * `render` from test/utils wraps a real ToastProvider, so the pane's own toasts
 * are assertable.
 */

interface Row { id: string; abbrev: string; name: string }
interface Draft { abbrev: string; name: string }

const ROWS: Row[] = [
  { id: '1', abbrev: 'GX', name: 'Global Express' },
  { id: '2', abbrev: 'WGS', name: 'Wideband Global' },
];

function setup(over: Partial<React.ComponentProps<typeof ReferenceLibraryPane<Row, Draft>>> = {}) {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);

  render(
    <ReferenceLibraryPane<Row, Draft>
      title="Test Library"
      subtitle="a subtitle"
      noun="things"
      singular="Thing"
      items={ROWS}
      isLoading={false}
      searchText={r => [r.abbrev, r.name].join(' ')}
      itemLabel={r => r.abbrev}
      canWrite
      emptyDraft={{ abbrev: '', name: '' }}
      draftOf={r => ({ abbrev: r.abbrev, name: r.name })}
      isComplete={d => d.abbrev.trim().length > 0}
      fieldGrid={{ template: '80px 1fr', headers: ['Abbrev', 'Name'] }}
      renderFields={(d, set, onEnter) => (
        <>
          <LibInput value={d.abbrev} onChange={v => { set({ ...d, abbrev: v }); }} onEnter={onEnter} placeholder="Abbrev" />
          <LibInput value={d.name} onChange={v => { set({ ...d, name: v }); }} onEnter={onEnter} placeholder="Name" />
        </>
      )}
      renderRow={r => <div>{r.abbrev} - {r.name}</div>}
      onCreate={onCreate}
      onSave={onSave}
      onDelete={onDelete}
      isCreating={false}
      isSaving={false}
      createError={null}
      createErrorFallback="Error creating thing"
      confirmDelete={r => `Delete ${r.abbrev}?`}
      saveErrorFallback="Could not save the thing"
      deleteErrorFallback="Could not delete the thing"
      {...over}
    />,
  );
  return { onCreate, onSave, onDelete, user: userEvent.setup() };
}

/** The add form opens on request, so a test that uses it opens it first. */
async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '+ Add a thing' }));
}

const confirmSpy = vi.fn<(message?: string) => boolean>();
beforeEach(() => {
  confirmSpy.mockReturnValue(true);
  vi.stubGlobal('confirm', confirmSpy);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('ReferenceLibraryPane', () => {
  // Share captures the sheet root, which is the whole pane; the controls a
  // reader with no write access never sees are marked to stay out of the
  // picture, so the slide matches the print route rather than carrying a
  // search field, a blank form and a pencil per row.
  it('marks the search box, the add form and the row pencils to stay out of the export', async () => {
    const { user } = setup();
    await openAdd(user);
    const root = document.querySelector('[data-sheet-root]');
    expect(root).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Search things' })).toHaveAttribute('data-sheet-omit', 'inline');
    expect(screen.getByText('Add a thing below:').parentElement).toHaveAttribute('data-sheet-omit', 'block');
    expect(screen.getByRole('button', { name: 'Edit GX' }).parentElement).toHaveAttribute('data-sheet-omit', 'inline');
  });

  describe('delete', () => {
    it('asks first, and does nothing when the confirm is declined', async () => {
      confirmSpy.mockReturnValue(false);
      const { onDelete, user } = setup();

      await user.click(screen.getByRole('button', { name: 'Delete GX' }));

      expect(confirmSpy).toHaveBeenCalledWith('Delete GX?');
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('deletes the row it names, and toasts when asked to', async () => {
      const { onDelete, user } = setup({ deletedMessage: r => `${r.abbrev} deleted` });

      await user.click(screen.getByRole('button', { name: 'Delete WGS' }));

      expect(onDelete).toHaveBeenCalledWith(ROWS[1]);
      expect(await screen.findByText('WGS deleted')).toBeInTheDocument();
    });

    it('surfaces the server message when the delete is refused', async () => {
      // The point of that change's 409: it names the assets carrying the waveform, and
      // that message is worth more than any fallback this pane could invent.
      const onDelete = vi.fn().mockRejectedValue(
        new ApiClientError('WAVEFORM_IN_USE', 'it is used by AN/PRC-158'),
      );
      const { user } = setup({ onDelete });

      await user.click(screen.getByRole('button', { name: 'Delete GX' }));

      expect(await screen.findByText('it is used by AN/PRC-158')).toBeInTheDocument();
    });

    it('falls back when the failure carries no server message', async () => {
      const onDelete = vi.fn().mockRejectedValue(new Error('socket hang up'));
      const { user } = setup({ onDelete });

      await user.click(screen.getByRole('button', { name: 'Delete GX' }));

      expect(await screen.findByText('Could not delete the thing')).toBeInTheDocument();
    });
  });

  describe('save', () => {
    it('closes the editor when the save succeeds', async () => {
      const { onSave, user } = setup();

      await user.click(screen.getByRole('button', { name: 'Edit GX' }));
      await user.type(screen.getByDisplayValue('Global Express'), ' 2');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      // Only the field that changed: see 'sends only what the edit changed'.
      expect(onSave).toHaveBeenCalledWith('1', { name: 'Global Express 2' });
      await waitFor(() => { expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument(); });
    });

    /**
     * The draft is a copy of the row as this page fetched it. Sending all of it
     * wrote that copy back over whatever had been saved since, on fields the
     * edit never touched: an owner filled in by another editor was blanked by
     * someone correcting a description on a page loaded before it.
     */
    it('sends only what the edit changed, so an untouched field is never written back', async () => {
      const { onSave, user } = setup();

      await user.click(screen.getByRole('button', { name: 'Edit GX' }));
      await user.clear(screen.getByDisplayValue('GX'));
      await user.type(screen.getByPlaceholderText('Abbrev'), 'GX2');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSave).toHaveBeenCalledWith('1', { abbrev: 'GX2' });
      const [, sent] = onSave.mock.calls[0] as [string, Record<string, unknown>];
      expect(sent).not.toHaveProperty('name');
    });

    // Save and Cancel sit at the right edge, away from the fields on the left
    // where the choices are made.
    it('puts Save and Cancel at the right edge of the editor', async () => {
      const { user } = setup();
      await user.click(screen.getByRole('button', { name: 'Edit GX' }));
      expect(screen.getByRole('group', { name: 'Save or cancel' })).toHaveStyle({ justifyContent: 'flex-end' });
    });

    it('closes without a request when nothing was changed', async () => {
      const { onSave, user } = setup();

      await user.click(screen.getByRole('button', { name: 'Edit GX' }));
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSave).not.toHaveBeenCalled();
      await waitFor(() => { expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument(); });
    });

    /**
     * The behaviour service and transport did not have before this pane: both
     * backends 409 on a duplicate name during update, and both panes rendered
     * nothing at all for it - the editor simply sat there.
     */
    it('keeps the editor open and says why when the save is refused', async () => {
      const onSave = vi.fn().mockRejectedValue(
        new ApiClientError('SERVICE_ABBREV_EXISTS', 'a service with that abbreviation already exists'),
      );
      const { user } = setup({ onSave });

      await user.click(screen.getByRole('button', { name: 'Edit GX' }));
      // A rename onto an abbrev another row holds, which is what the 409 is for.
      await user.clear(screen.getByDisplayValue('GX'));
      await user.type(screen.getByPlaceholderText('Abbrev'), 'WGS');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('a service with that abbreviation already exists')).toBeInTheDocument();
      // Still open, so the edit can be corrected rather than retyped.
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('refuses to save an empty required field', async () => {
      const { user } = setup();

      await user.click(screen.getByRole('button', { name: 'Edit GX' }));
      await user.clear(screen.getByDisplayValue('GX'));

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });
  });

  describe('create', () => {
    it('clears the form and the search once the write settles', async () => {
      const { onCreate, user } = setup();
      await openAdd(user);
      const box = screen.getByLabelText('Search things');
      await user.type(box, 'zzz');
      await user.type(screen.getByPlaceholderText('Abbrev'), 'NEW');

      await user.click(screen.getByRole('button', { name: '+ Add to Test Library' }));

      expect(onCreate).toHaveBeenCalledWith({ abbrev: 'NEW', name: '' });
      await waitFor(() => { expect(box).toHaveValue(''); });
    });

    it('keeps the draft and the search when the create fails', async () => {
      // Reported inline by `createError`, never toasted, so the typed values
      // survive for a retry rather than being thrown away.
      const onCreate = vi.fn().mockRejectedValue(new Error('nope'));
      const { user } = setup({ onCreate });
      await openAdd(user);
      const box = screen.getByLabelText('Search things');
      await user.type(box, 'zzz');
      await user.type(screen.getByPlaceholderText('Abbrev'), 'NEW');

      await user.click(screen.getByRole('button', { name: '+ Add to Test Library' }));

      await waitFor(() => { expect(onCreate).toHaveBeenCalled(); });
      expect(screen.getByPlaceholderText('Abbrev')).toHaveValue('NEW');
      expect(box).toHaveValue('zzz');
    });

    it('renders a create failure inline rather than as a toast', async () => {
      const { user } = setup({ createError: new Error('abbrev already exists') });
      await openAdd(user);
      expect(screen.getByText('abbrev already exists')).toBeInTheDocument();
    });

    it('creates on Enter in the add form, but not in the edit form', async () => {
      const { onCreate, onSave, user } = setup();
      await openAdd(user);

      await user.type(screen.getByPlaceholderText('Abbrev'), 'NEW{Enter}');
      expect(onCreate).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: 'Edit GX' }));
      await user.type(screen.getByDisplayValue('GX'), '{Enter}');
      // Enter in a row editor would be ambiguous: save, or create another?
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('the gate', () => {
    it('hides every write control from a reader, and keeps the rows', () => {
      setup({ canWrite: false });

      expect(screen.getByText(/GX - Global Express/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '+ Add to Test Library' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
    });
  });

  describe('the shape B3 needs', () => {
    it('draws no column headers when there is no field grid', () => {
      setup({ fieldGrid: undefined });
      expect(screen.queryByText('Abbrev')).not.toBeInTheDocument();
      expect(screen.getByText(/GX - Global Express/)).toBeInTheDocument();
    });

    // The headers label the add form's inputs, which share their grid template.
    // Above the list they lined up with nothing, since rows are a flex line.
    it('draws the column headers once, in the add form', async () => {
      const { user } = setup();
      await openAdd(user);
      const header = screen.getByText('Abbrev');
      expect(header).toBeInTheDocument();
      expect(screen.getAllByText('Abbrev')).toHaveLength(1);
      // Before the add button in document order, i.e. inside the form.
      const add = screen.getByRole('button', { name: '+ Add to Test Library' });
      expect(header.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('draws no column headers for a reader, who has no add form', () => {
      setup({ canWrite: false });
      expect(screen.queryByText('Abbrev')).not.toBeInTheDocument();
    });

    it('renders renderRowExtra beneath every row', () => {
      setup({ renderRowExtra: r => <div>extra for {r.abbrev}</div> });
      expect(screen.getByText('extra for GX')).toBeInTheDocument();
      expect(screen.getByText('extra for WGS')).toBeInTheDocument();
    });

    it('renders nothing extra when renderRowExtra is omitted', () => {
      setup();
      expect(screen.queryByText(/^extra for/)).not.toBeInTheDocument();
    });
  });

  // that change's readout. Rendered by the wrappers through renderRow/renderRowExtra,
  // so these are unit tests of the two pieces rather than of the pane.
  describe('the usage readout', () => {
    it('renders no strip at all when nothing uses the entry', () => {
      // Not an empty flex row: an unused entry must not grow a blank line, the
      // same rule the platform pane's chip strip follows. The count beside it
      // already says "unused", so a strip here would add height and no fact.
      const { container } = render(<UsageNames names={[]} layout="strip" />);
      expect(container).toBeEmptyDOMElement();
    });

    it('keeps an empty column cell when nothing uses the entry', () => {
      // The opposite rule, deliberately. In the wide layout the cell holds the
      // column's x position, so dropping it on unused rows is what would make
      // the chips of neighbouring rows start at different places.
      const { container } = render(<UsageNames names={[]} layout="column" />);
      expect(container.firstElementChild).not.toBeNull();
      expect(container.firstElementChild).toBeEmptyDOMElement();
    });

    it.each(['column', 'strip'] as const)('renders one chip per name as a %s', layout => {
      render(<UsageNames names={['AN/PRC-158', 'AN/PRC-163']} layout={layout} />);
      expect(screen.getByText('AN/PRC-158')).toBeInTheDocument();
      expect(screen.getByText('AN/PRC-163')).toBeInTheDocument();
    });

    it('says unused rather than showing a zero', () => {
      render(<UsageCount names={[]} noun="asset" />);
      expect(screen.getByText('unused')).toBeInTheDocument();
      expect(screen.queryByText(/^0 /)).not.toBeInTheDocument();
    });

    it('agrees with itself about singular and plural', () => {
      const { unmount } = render(<UsageCount names={['a']} noun="asset" />);
      expect(screen.getByText('1 asset')).toBeInTheDocument();
      unmount();

      render(<UsageCount names={['a', 'b']} noun="terminal" />);
      expect(screen.getByText('2 terminals')).toBeInTheDocument();
    });
  });

  // Two lines at a fixed height, so every row is one size. jsdom computes no
  // layout, so the uniform height itself was measured in a browser (66.8px on
  // every row); these pin the two properties that produce it.
  describe('NameAndDesc', () => {
    it('draws the description cell even when there is no description', () => {
      // The cell holds the row's height. Dropping it on rows without a
      // description is what would make those rows shorter than their neighbours.
      const { container } = render(<NameAndDesc name="GX" description="" />);
      expect(container.firstElementChild?.children).toHaveLength(2);
    });

    it('carries the full description as a tooltip, for text past two lines', () => {
      const long = 'A description long enough to need more than the two lines a row shows';
      render(<NameAndDesc name="GX" description={long} />);
      expect(screen.getByText(long)).toHaveAttribute('title', long);
    });
  });

  describe('the three empty states', () => {
    it('tells a writer they can add the first row', () => {
      setup({ items: [] });
      expect(screen.getByText('No things yet. Add one above.')).toBeInTheDocument();
    });

    it('does not tell a reader to add one', () => {
      setup({ items: [], canWrite: false });
      expect(screen.getByText('No things yet.')).toBeInTheDocument();
    });

    it('distinguishes an empty library from an empty search', async () => {
      const { user } = setup();
      await user.type(screen.getByLabelText('Search things'), 'zzzznope');
      expect(screen.getByText('No things match "zzzznope".')).toBeInTheDocument();
    });
  });
});

// The filter bar: one row per facet, any-of within a row and all-of across
// rows, whole values matched case-insensitively. Until 2026-09 this was a
// single tag filter the platform pane fed with carried waveforms, driven also
// by chips on each row; the rows no longer drive it, so the test that the
// page scrolled back up after a row-chip click went with them.
describe('ReferenceLibraryPane facet filter', () => {
  interface Plat { id: string; designation: string; popular: string; waveforms: string[]; branch: string }
  const PLATS: Plat[] = [
    { id: 'a', designation: 'SSN-688', popular: 'Los Angeles', waveforms: ['MUOS'], branch: 'USN' },
    { id: 'b', designation: 'S-MET', popular: 'MUTT', waveforms: ['Wave Relay', 'LOS'], branch: 'USA' },
    { id: 'c', designation: 'MQ-9A', popular: 'Reaper', waveforms: ['los'], branch: 'USAF' },
  ];

  function setupFacets() {
    render(
      <ReferenceLibraryPane<Plat, Draft>
        title="Platform Library"
        subtitle="a subtitle"
        noun="platforms"
        singular="Platform"
        items={PLATS}
        isLoading={false}
        searchText={p => [p.designation, p.popular, ...p.waveforms].join(' ')}
        itemLabel={p => p.designation}
        canWrite={false}
        emptyDraft={{ abbrev: '', name: '' }}
        draftOf={() => ({ abbrev: '', name: '' })}
        isComplete={() => true}
        renderFields={() => null}
        renderRow={p => <div>{p.designation}</div>}
        facets={[
          { label: 'Waveform', valuesOf: p => p.waveforms },
          { label: 'Branch', valuesOf: p => [p.branch], order: ['USA', 'USN', 'USAF'] },
        ]}
        onCreate={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        isCreating={false}
        isSaving={false}
        createError={null}
        createErrorFallback=""
        confirmDelete={() => ''}
        saveErrorFallback=""
        deleteErrorFallback=""
      />,
    );
    return userEvent.setup();
  }

  // A substring search for LOS also returns the Los Angeles class. A facet
  // chip means "has this value", so it matches whole values, in any case.
  it('filters to rows with the chosen value exactly, ignoring case', async () => {
    const user = setupFacets();

    await user.click(screen.getByRole('button', { name: /^LOS 2$/ }));

    expect(screen.getByText('S-MET')).toBeInTheDocument();
    expect(screen.getByText('MQ-9A')).toBeInTheDocument();
    expect(screen.queryByText('SSN-688')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^LOS 2$/, pressed: true })).toBeInTheDocument();
  });

  it('clicking a chosen value again shows everything', async () => {
    const user = setupFacets();

    await user.click(screen.getByRole('button', { name: /^LOS 2$/ }));
    await user.click(screen.getByRole('button', { name: /^LOS 2$/ }));

    expect(screen.getByText('SSN-688')).toBeInTheDocument();
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument();
  });

  it('takes any of a row and all of the rows together', async () => {
    const user = setupFacets();

    await user.click(screen.getByRole('button', { name: /^USA 1$/ }));
    await user.click(screen.getByRole('button', { name: /^USAF 1$/ }));
    expect(screen.getByText('S-MET')).toBeInTheDocument();
    expect(screen.getByText('MQ-9A')).toBeInTheDocument();
    expect(screen.queryByText('SSN-688')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Wave Relay 1$/ }));
    expect(screen.getByText('S-MET')).toBeInTheDocument();
    expect(screen.queryByText('MQ-9A')).not.toBeInTheDocument();
  });

  it('orders a row by its given order, and labels it by its facet', () => {
    setupFacets();
    const branch = screen.getByRole('group', { name: 'Branch' });
    expect(within(branch).getAllByRole('button').map(b => b.textContent)).toEqual(['USA 1', 'USN 1', 'USAF 1']);
  });

  it('Clear resets every row, and the empty state names both filters', async () => {
    const user = setupFacets();

    await user.click(screen.getByRole('button', { name: /^MUOS 1$/ }));
    await user.type(screen.getByRole('textbox', { name: 'Search platforms' }), 'reaper');
    expect(screen.getByText('No platforms with waveform MUOS and match "reaper".')).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Search platforms' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('MQ-9A')).toBeInTheDocument();
    expect(screen.getByText('SSN-688')).toBeInTheDocument();
  });

  // The count is the visible answer to "did the click do anything": it moves
  // from a total the reader has already seen to "x of total".
  it('counts what is shown against the whole library', async () => {
    const user = setupFacets();
    const count = () => screen.getByText((_, el) => el?.getAttribute('aria-live') === 'polite').textContent;

    expect(count()).toBe('3 platforms');
    await user.click(screen.getByRole('button', { name: /^LOS 2$/ }));
    expect(count()).toBe('2 of 3 platforms');
    await user.type(screen.getByRole('textbox', { name: 'Search platforms' }), 'reaper');
    expect(count()).toBe('1 of 3 platforms');
    await user.clear(screen.getByRole('textbox', { name: 'Search platforms' }));
    await user.click(screen.getByRole('button', { name: /^LOS 2$/ }));
    expect(count()).toBe('3 platforms');
  });
});

// A tile is clicked far more often than its small pencil is found. For a writer
// it opens the same editor; controls inside it keep their own meaning.
describe('ReferenceLibraryPane tile click', () => {
  it('opens the editor for a writer', async () => {
    const { user } = setup();

    await user.click(screen.getByText('GX - Global Express'));

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does nothing for a reader', async () => {
    const { user } = setup({ canWrite: false });

    await user.click(screen.getByText('GX - Global Express'));

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('leaves a control inside the tile to its own action', async () => {
    const onChip = vi.fn();
    const { user } = setup({
      renderRowExtra: r => <button type="button" onClick={onChip}>{`chip ${r.abbrev}`}</button>,
    });

    await user.click(screen.getByRole('button', { name: 'chip GX' }));

    expect(onChip).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
