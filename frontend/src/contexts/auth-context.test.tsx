import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';

import { createQueryWrapper } from '@/test/utils';
import { AuthProvider, useAuth } from './auth-context';
import type { User } from '@/types';

// The provider's three inputs, and all it has.
const { mockUseCurrentUser } = vi.hoisted(() => ({ mockUseCurrentUser: vi.fn() }));
vi.mock('@/services/auth-service', () => ({ useCurrentUser: mockUseCurrentUser }));
vi.mock('@azure/msal-react', () => ({ useIsAuthenticated: () => true }));
vi.mock('@/auth/msal-config', () => ({ authConfig: { enabled: false } }));

function withRoles(roles: string[]) {
  const user = { id: 'u1', name: 'Tester', email: 't@example.test', roles } as User;
  mockUseCurrentUser.mockReturnValue({
    data: user,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

function flags() {
  const QueryWrapper = createQueryWrapper();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryWrapper>
      <AuthProvider>{children}</AuthProvider>
    </QueryWrapper>
  );
  return renderHook(() => useAuth(), { wrapper }).result.current;
}

beforeEach(() => {
  mockUseCurrentUser.mockReset();
});

/**
 * Every permission flag used to derive from roles[0] while the backend's
 * HasRole scans the whole array, so the frontend was the stricter layer and
 * hid controls the server would have allowed.
 *
 * The three membership cases below fail against that derivation; the three
 * after them are the guards that the fix did not widen anything.
 */
describe('permission flags read role membership', () => {
  it('finds admin behind another role', () => {
    withRoles(['editor', 'admin']);

    expect(flags().isAdmin).toBe(true);
  });

  it('finds admin behind a group name, and still shows no primary role', () => {
    // The array the API never writes: UpdateRole always replaces it with
    // exactly one role, so a leading group name is legacy or external.
    withRoles(['Legacy-Admins', 'admin']);

    const f = flags();
    expect(f.isAdmin).toBe(true);
    expect(f.canWrite).toBe(true);
    expect(f.canWriteRadio).toBe(true);
    // role is for display and validates roles[0], so it stays null here.
    expect(f.role).toBeNull();
  });

  it('grants rto its radio writes without granting the rest', () => {
    withRoles(['viewer', 'rto']);

    const f = flags();
    expect(f.canWriteRadio).toBe(true);
    expect(f.canWrite).toBe(false);
    expect(f.canSeeContracts).toBe(false);
    expect(f.isAdmin).toBe(false);
  });

  it('shows contracts to an editor and to nobody below', () => {
    // Contracts are internal: the flag names admin and editor, and a
    // planner held alongside viewer does not reach it. Viewer is not a wider
    // role, so that user is still a pure planner for the nav rule.
    withRoles(['editor']);
    expect(flags().canSeeContracts).toBe(true);

    withRoles(['viewer', 'planner']);
    const f = flags();
    expect(f.canSeeContracts).toBe(false);
    expect(f.canWritePace).toBe(true);
    expect(f.isPlanner).toBe(true);
  });

  it('grants a viewer nothing', () => {
    withRoles(['viewer']);

    const f = flags();
    expect(f.isAdmin).toBe(false);
    expect(f.canWrite).toBe(false);
    expect(f.canWriteRadio).toBe(false);
    expect(f.canSeeContracts).toBe(false);
    expect(f.role).toBe('viewer');
  });

  it('grants an empty array nothing', () => {
    withRoles([]);

    const f = flags();
    expect(f.isAdmin).toBe(false);
    expect(f.canWrite).toBe(false);
    expect(f.canWriteRadio).toBe(false);
    expect(f.role).toBeNull();
  });

  it('grants a single admin everything', () => {
    withRoles(['admin']);

    const f = flags();
    expect(f.isAdmin).toBe(true);
    expect(f.canWrite).toBe(true);
    expect(f.canWriteRadio).toBe(true);
    expect(f.canSeeContracts).toBe(true);
    expect(f.role).toBe('admin');
  });
});
