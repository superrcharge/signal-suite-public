import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarToggle } from './use-sidebar-toggle';

describe('useSidebarToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Both directions, because the whole point of the required argument is that
  // a `false` at the call site actually collapses the group.
  it.each([true, false])('returns defaultOpen=%s when nothing is stored', (defaultOpen) => {
    const { result } = renderHook(() => useSidebarToggle('kits', defaultOpen));

    expect(result.current[0]).toBe(defaultOpen);
    // Reading never writes: a user who has not toggled has no key.
    expect(localStorage.getItem('signal-suite-sidebar-kits')).toBeNull();
  });

  it('lets a stored value beat the default', () => {
    localStorage.setItem('signal-suite-sidebar-kits', 'false');
    const { result } = renderHook(() => useSidebarToggle('kits', true));

    expect(result.current[0]).toBe(false);
  });

  it('writes the new value on toggle', () => {
    const { result } = renderHook(() => useSidebarToggle('kits', false));

    act(() => result.current[1]());

    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('signal-suite-sidebar-kits')).toBe('true');
  });
});
