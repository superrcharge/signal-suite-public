import { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import { useCurrentUser } from '@/services/auth-service';
import { authConfig } from '@/auth/msal-config';
import type { User } from '@/types';

export type { User };

import { ROLES, type Role } from '@/types/roles';

export type { Role };

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  /**
   * Primary role of the current user (first entry in roles[]), for display.
   * Null when not authenticated, or when that first entry is not a role this
   * app knows.
   *
   * This carries no authorization meaning. The flags below are derived from
   * membership anywhere in roles[], the way the backend's HasRole reads it.
   */
  role: Role | null;
  /** True when the user holds the admin role. */
  isAdmin: boolean;
  /** True when the user can trigger mutations on terminals/sections (admin or editor). */
  canWrite: boolean;
  /**
   * True when the user should see the Contracts surfaces at all: the sidebar
   * group, the page-menu entry and the Dashboard panel. Admin and editor only.
   *
   * This shapes NAVIGATION, like {@link isPlanner}, and authorizes nothing:
   * `GET /api/v1/contracts` and the contracts export stay open to every
   * authenticated role, and `/contracts` still renders read-only by URL.
   * Contracts are internal, so the other roles are not shown them. It is
   * a flag of its own rather than a reuse of `canWrite`, because the two name
   * the same roles today and stop agreeing the moment a role can write
   * contracts it should not be steered towards, or see contracts it cannot
   * write. Additive, so a wider role satisfies it directly.
   */
  canSeeContracts: boolean;
  /**
   * True when the user can mutate the radio side of the catalog - waveforms,
   * and equipment whose `terminal_type` is `radio`. Admins and editors write
   * everything, so they satisfy this too; rto satisfies only this.
   *
   * This is deliberately not a general `canWrite(scope)`: a boolean per scoped
   * surface is cheaper than reworking every `canWrite` call site. The
   * per-record half of the rule (which catalog entries an rto user may touch)
   * is enforced by the backend regardless.
   *
   * This used to gate nets and PACE as well - see {@link canWritePace}.
   */
  canWriteRadio: boolean;
  /**
   * True when the user can mutate nets and PACE cards. Admins, editors, rto
   * and planner.
   *
   * Split out of `canWriteRadio`, which bundled four surfaces into one flag:
   * nets, PACE, waveform creation and the catalog editor. `planner` writes the
   * first two and only reads the catalog, so the flag had to divide before the
   * role could exist. `canWriteRadio` keeps its original meaning for waveforms
   * and the catalog editor, and every role that had it still has both.
   */
  canWritePace: boolean;
  /**
   * True for the planner role, which shapes NAVIGATION rather than authorizing
   * anything.
   *
   * Reads are open to any authenticated user across every domain - see
   * `terminal/routes.go` and `authz_test.go`, which both say so outright - and
   * this role is deliberately not the first exception. So a planner is shown
   * only the surfaces it uses, and the ones it does not need are out of its way
   * rather than walled off. Treat this as a view preference with a role's name
   * on it, and never as a security boundary.
   */
  isPlanner: boolean;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * The role to *show*. Not the role to decide anything by - see hasRole.
 */
function primaryRole(user: User | null | undefined): Role | null {
  const raw = user?.roles?.[0];
  return ROLES.includes(raw as Role) ? (raw as Role) : null;
}

/**
 * Membership anywhere in roles[], which is how the backend reads it.
 *
 * Every permission flag used to derive from primaryRole, so the frontend
 * consulted `roles[0]` alone while the backend's HasRole
 * (`domain/user/model.go`) scans the whole slice. The frontend was the
 * stricter of the two, and it hid controls the server would have allowed: an
 * admin whose array began with anything else - a legacy value from before the
 * RBAC migration, or a group name - lost the row edit icon, the drawer behind
 * it, and Delete with it.
 *
 * The API only ever writes exactly one role (UpdateRole replaces the array),
 * so multi-role is a schema capability rather than a supported operation. That
 * is precisely why this must not assume position: the arrays that break it are
 * the ones the API did not write.
 */
function hasRole(user: User | null | undefined, role: Role): boolean {
  return (user?.roles ?? []).includes(role);
}

export function AuthProvider({ children }: AuthProviderProps) {
  // When auth is enabled, only call /users/me after MSAL reports an
  // authenticated account - otherwise the request goes out without
  // a Bearer header and the backend rightly rejects it. When auth is
  // disabled (compose dev), the backend bypass returns the seed user
  // unconditionally, so we always fetch.
  const msalAuthenticated = useIsAuthenticated();
  const ready = !authConfig.enabled || msalAuthenticated;

  const { data: user, isLoading, isError, refetch } = useCurrentUser(ready);

  const handleRefetch = useCallback(() => {
    void refetch();
  }, [refetch]);

  const value = useMemo<AuthContextValue>(() => {
    const has = (role: Role) => hasRole(user, role);
    const admin = has('admin');
    const editor = has('editor');
    const rto = has('rto');
    return {
      user: user ?? null,
      isAuthenticated: ready && !!user,
      isLoading,
      isError,
      // Display only. Every flag below reads membership instead.
      role: primaryRole(user),
      isAdmin: admin,
      canWrite: admin || editor,
      canSeeContracts: admin || editor,
      canWriteRadio: admin || editor || rto,
      canWritePace: admin || editor || rto || has('planner'),
      // Membership, minus the roles that grant a broader view. isPlanner
      // SUBTRACTS navigation, so unlike every flag above it must not fire for
      // someone who also holds a wider role - `["admin","planner"]` would
      // otherwise lose Terminals and Kits, which is a regression
      // rather than a decluttered view.
      isPlanner: has('planner') && !admin && !editor && !rto,
      refetch: handleRefetch,
    };
  }, [user, ready, isLoading, isError, handleRefetch]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
