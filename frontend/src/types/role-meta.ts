import { alpha } from '@mui/material/styles';
import { ROLE_COLORS } from '@/theme/asset-colors';
import type { Role } from './roles';

// `description` does double duty: the caption under each stat strip count,
// the secondary line in the role-change menu, and now the role legend read
// by the app header and the in-app help dialog. Kept to one line so it fits
// a strip cell without wrapping - the strip is where users learn what a role
// grants, so there is no separate privileges legend.
export const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: 'admin',  label: 'Admin',  description: 'Every domain, plus user roles and the audit log' },
  { value: 'editor', label: 'Editor', description: 'Writes every domain; no user management' },
  { value: 'rto',    label: 'RTO',    description: 'Writes radio + waveforms; reads the rest' },
  { value: 'planner', label: 'Planner', description: 'Writes nets + PACE; reads the catalog' },
  { value: 'viewer', label: 'Viewer', description: 'Reads everything; no writes' },
];

/**
 * Role-specific color tokens, derived from the shared role palette so a
 * recolor happens in one place. `bg` is the badge background; `fg` is both
 * the label color and, at a heavier alpha, the border.
 *
 * `viewer` is lifted to 0.18 for `bg` where every other role uses 0.14,
 * because its grey needs more alpha to read at the same weight. Border
 * stays 0.35 for every role.
 */
export function roleStyle(role: Role): { bg: string; fg: string; border: string } {
  const color = ROLE_COLORS[role];
  return {
    bg: alpha(color, role === 'viewer' ? 0.18 : 0.14),
    fg: color,
    border: alpha(color, 0.35),
  };
}

export function roleLabel(role: Role): string {
  return ROLE_OPTIONS.find((opt) => opt.value === role)?.label ?? role;
}

export function roleDescription(role: Role): string {
  return ROLE_OPTIONS.find((opt) => opt.value === role)?.description ?? '';
}
