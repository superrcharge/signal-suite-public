/**
 * Authorization roles.
 *
 * Kept here rather than in `auth-context` so the list can be imported as a
 * value without tripping react-refresh, which requires component files to
 * export only components.
 *
 * The backend is the authority: this must stay in sync with `ValidRoles` in
 * `backend/internal/domain/user/model.go`, which rejects anything outside its
 * own list. Order matters only for display.
 */
export const ROLES = ['admin', 'editor', 'viewer', 'rto', 'planner'] as const;

export type Role = (typeof ROLES)[number];
