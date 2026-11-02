import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils';
import { LibInput, ReferenceLibraryPane } from './ReferenceLibraryPane';

interface Row { id: string; name: string }
interface Draft { name: string }

function pane(article?: string) {
  const user = userEvent.setup();
  render(
    <ReferenceLibraryPane<Row, Draft>
      title="Test Library"
      subtitle="a subtitle"
      noun="operators"
      singular="Operator"
      article={article}
      items={[{ id: '1', name: 'Ada' }]}
      isLoading={false}
      searchText={r => r.name}
      itemLabel={r => r.name}
      canWrite
      emptyDraft={{ name: '' }}
      draftOf={r => ({ name: r.name })}
      isComplete={d => d.name.trim().length > 0}
      fieldGrid={{ template: '1fr', headers: ['Name'] }}
      renderFields={(d, set, onEnter) => (
        <LibInput value={d.name} onChange={v => { set({ name: v }); }} onEnter={onEnter} placeholder="Name" />
      )}
      renderRow={r => <div>{r.name}</div>}
      onCreate={vi.fn().mockResolvedValue(undefined)}
      onSave={vi.fn().mockResolvedValue(undefined)}
      onDelete={vi.fn().mockResolvedValue(undefined)}
      isCreating={false}
      isSaving={false}
      createError={null}
      createErrorFallback="Error creating operator"
      confirmDelete={r => `Delete ${r.name}?`}
      saveErrorFallback="Could not save"
      deleteErrorFallback="Could not delete"
    />,
  );
  return user;
}

describe('ReferenceLibraryPane article', () => {
  it('uses the given article in the add row', () => {
    pane('an');
    expect(screen.getByRole('button', { name: '+ Add an operator' })).toBeInTheDocument();
  });

  it('defaults to "a"', () => {
    pane();
    expect(screen.getByRole('button', { name: '+ Add a operator' })).toBeInTheDocument();
  });

  it('uses the given article in the open form heading', async () => {
    const user = pane('an');
    await user.click(screen.getByRole('button', { name: '+ Add an operator' }));
    expect(screen.getByText('Add an operator below:')).toBeInTheDocument();
  });
});
