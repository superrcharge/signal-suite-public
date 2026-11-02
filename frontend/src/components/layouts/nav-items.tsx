// The nav list and the icon it needs share one module so the header and the dashboard read one source;
// Fast Refresh falls back to a full reload on this file, which is rare and harmless.
/* eslint-disable react-refresh/only-export-components */
import type { ComponentType } from 'react';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BarChartIcon from '@mui/icons-material/BarChart';
// Router over the generic Widgets squares - kits are network gear, and
// this is the closest stock match to a router appliance (chassis body
// with status lights and antennas).
import RouterIcon from '@mui/icons-material/Router';
import PeopleIcon from '@mui/icons-material/People';
import SettingsIcon from '@mui/icons-material/Settings';
import DescriptionIcon from '@mui/icons-material/Description';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { CrosshairIcon } from '@/components/common/crosshair-icon';
import { PaceIcon } from '@/components/common/pace-icon';

// Ground-station dish glyph - rendered as the literal U+1F4E1 emoji so
// it matches what the user explicitly referenced and avoids the MUI
// icon set's satellite icons (which read as either "framed image" or
// space satellite). Wrapped in a span sized to match the surrounding
// fontSize="small" MUI icons (~18px).
export const SatelliteDishIcon = ({ fontSize = 'small' }: { fontSize?: 'small' | 'inherit' }) => (
  <span
    aria-hidden
    // 'inherit' scales with the parent the way an MUI icon's fontSize="inherit" does, so it takes no fixed width.
    style={
      fontSize === 'inherit'
        ? { fontSize: '0.75em', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
        : { fontSize: 13, lineHeight: 1, width: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
    }
  >
    📡
  </span>
);

export interface NavItem {
  label: string;
  path: string;
  Icon: ComponentType<{ fontSize?: 'small' | 'inherit' }>;
  disabled?: boolean;
  /**
   * An auth flag the viewer must hold for the item to appear, named the way
   * help-content.ts names its `gate`. A flag name rather than a predicate, so
   * the list stays readable and every gate is one of the booleans off
   * useAuth() rather than per-item logic. This hides a nav item; it does not
   * deny anything - the route answers by URL and the server is the authority.
   *
   * The rule for `isAdmin`: a page whose READ the server refuses for a role
   * is not offered to that role. Users is such a page (`GET /api/v1/users` is
   * admin-only), so a viewer is not handed a menu entry whose only
   * destination is a refusal screen. The audit log, the other admin-only
   * read, is a Settings tab now, gated there rather than here.
   */
  gate?: 'isAdmin' | 'canSeeContracts' | 'canSeeTrackers';
  /**
   * Hidden from the planner role, which sees a planning-shaped app.
   *
   * Kept separate from `gate` because the two point opposite ways: `gate`
   * REQUIRES a flag, this SUBTRACTS for one role, and a wider role held
   * alongside planner must keep the item - see AuthContextValue.isPlanner.
   */
  hideFromPlanner?: boolean;
  /**
   * Extra route prefixes this item owns for the purpose of naming the page.
   *
   * The Nets Library lives under PACE Planning in the sidebar but sits at its
   * own /nets route, so without this the page menu matched nothing there and
   * fell back to the literal product name, which is not a page and not
   * anywhere the menu can go.
   */
  alsoMatches?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  path: '/dashboard', Icon: DashboardIcon },
  { label: 'Stats',      path: '/stats',     Icon: BarChartIcon },
  { label: 'Terminals',  path: '/terminals', Icon: SatelliteDishIcon, gate: 'canSeeTrackers' },
  { label: 'Kits',       path: '/kits',      Icon: RouterIcon, gate: 'canSeeTrackers' },
  { label: 'Catalog',   path: '/catalog',   Icon: MenuBookIcon },
  { label: 'PACE',      path: '/pace',      Icon: PaceIcon, alsoMatches: ['/nets'] },
  { label: 'Operations', path: '/operations', Icon: CrosshairIcon },
  { label: 'Contracts', path: '/contracts', Icon: DescriptionIcon, gate: 'canSeeContracts' },
  { label: 'Users',      path: '/users',     Icon: PeopleIcon, gate: 'isAdmin' },
  { label: 'Settings',   path: '/settings',  Icon: SettingsIcon },
  // No Audit Log row: the log's one home is Settings, Audit log, and /audit
  // only redirects there. A row of its own had the picker saying "Settings"
  // while the log showed, or naming a page that is not one.
];

/**
 * The items a viewer is offered: drop the ones whose gate they do not hold,
 * then the ones a planner is spared. Gated routes are additionally guarded
 * server-side.
 */
export function visibleNavItems(flags: {
  isAdmin: boolean;
  canSeeContracts: boolean;
  canSeeTrackers: boolean;
  isPlanner: boolean;
}): NavItem[] {
  const gates = {
    isAdmin: flags.isAdmin,
    canSeeContracts: flags.canSeeContracts,
    canSeeTrackers: flags.canSeeTrackers,
  } as const;
  return NAV_ITEMS.filter(
    (n) => (!n.gate || gates[n.gate]) && !(n.hideFromPlanner && flags.isPlanner),
  );
}
