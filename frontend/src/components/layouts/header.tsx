import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Box,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  Divider,
  ListItemIcon,
  Button,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ApiIcon from '@mui/icons-material/Api';
import LogoutIcon from '@mui/icons-material/Logout';
import DashboardIcon from '@mui/icons-material/Dashboard';
// Ground-station dish glyph - rendered as the literal U+1F4E1 emoji so
// it matches what the user explicitly referenced and avoids the MUI
// icon set's satellite icons (which read as either "framed image" or
// space satellite). Wrapped in a span sized to match the surrounding
// fontSize="small" MUI icons (~18px).
const SatelliteDishIcon = () => (
  <span aria-hidden style={{ fontSize: 13, lineHeight: 1, width: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
    📡
  </span>
);
// Router over the generic Widgets squares - kits are network gear, and
// this is the closest stock match to a router appliance (chassis body
// with status lights and antennas).
import RouterIcon from '@mui/icons-material/Router';
import PeopleIcon from '@mui/icons-material/People';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import DescriptionIcon from '@mui/icons-material/Description';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import { useState, MouseEvent } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/contexts';
import { useLogout } from '@/services';
import { usePaceSections } from '@/components/pace/use-pace-sections';
import { CsvHeaderControls } from '@/components/common/csv/csv-header-controls';
import { HelpButton } from '@/components/help/help-button';
import { RoleBadge, SignalSuiteMark } from '@/components/common';
import { CONTENT_LINE } from '@/components/common/banner-controls';
import { SCROLLBAR_W } from '@/theme/global-styles';
import {
  ADD_ICON_FONT_SIZE,
  HEADER_CLUSTER_GAP,
  HEADER_CONTROL_H,
  HEADER_ICON_BUTTON_SX,
  HEADER_SMALL_ICON_BUTTON_SX,
  HEADER_TRIGGER_SX,
} from '@/components/common/header-trigger-sx';
import { roleDescription } from '@/types/role-meta';
import { ROLES, type Role } from '@/types/roles';

/**
 * A 1px x 24px chrome rule. Four stand in the bar: beside the sidebar toggle,
 * after the page picker, after the `+`, and before the lockup.
 *
 * 24px rather than HEADER_CONTROL_H, so it matches the lockup's optical
 * height; the outlined controls step to 28 at md and a rule that grew with
 * them stood taller than the wordmark beside it. Height, not `flexItem`:
 * `flexItem` stretches to the tallest thing in the row, the 42px account
 * button. It takes no margin, by design and by having no prop for one: the
 * cluster's gap (HEADER_CLUSTER_GAP) is the spacing, and a neighbour that
 * seems to need an optical correction is a neighbour carrying padding it
 * should cancel - see HEADER_ICON_BUTTON_SX.
 */
const HeaderRule = () => (
  <Divider
    orientation="vertical"
    sx={{ height: 24, alignSelf: 'center', borderColor: 'rgba(255,255,255,0.15)' }}
  />
);

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  disabled?: boolean;
  /**
   * An auth flag the viewer must hold for the item to appear, named the way
   * help-content.ts names its `gate`. A flag name rather than a predicate, so
   * the list stays readable and every gate is one of the booleans off
   * useAuth() rather than per-item logic. This hides a nav item; it does not
   * deny anything - the route answers by URL and the server is the authority.
   *
   * The rule for `isAdmin`: a page whose READ the server refuses for a role
   * is not offered to that role. Users and Audit Log are the two such pages
   * (`GET /api/v1/users` and `GET /api/v1/audit` are admin-only), so a viewer
   * is not handed a menu entry whose only destination is a refusal screen.
   */
  gate?: 'isAdmin' | 'canSeeContracts';
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

const navItems: NavItem[] = [
  { label: 'Dashboard',  path: '/dashboard', icon: <DashboardIcon fontSize="small" />, hideFromPlanner: true },
  { label: 'Terminals',  path: '/terminals', icon: <SatelliteDishIcon />, hideFromPlanner: true },
  { label: 'Kits',       path: '/kits',      icon: <RouterIcon fontSize="small" />, hideFromPlanner: true },
  { label: 'Catalog',   path: '/catalog',   icon: <MenuBookIcon fontSize="small" /> },
  { label: 'PACE',      path: '/pace',      icon: <SettingsInputAntennaIcon fontSize="small" />, alsoMatches: ['/nets'] },
  { label: 'Contracts', path: '/contracts', icon: <DescriptionIcon fontSize="small" />, gate: 'canSeeContracts' },
  { label: 'Users',      path: '/users',     icon: <PeopleIcon fontSize="small" />, gate: 'isAdmin' },
  { label: 'Settings',   path: '/settings',  icon: <SettingsIcon fontSize="small" /> },
  { label: 'Audit Log',  path: '/audit',     icon: <HistoryIcon fontSize="small" />, gate: 'isAdmin' },
];

interface HeaderProps {
  onMenuClick: () => void;
  sidebarOpen: boolean;
  sidebarWidth: number;
}

export function Header({ onMenuClick, sidebarOpen, sidebarWidth: _sidebarWidth }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // Add Net sits beside Add Kit and Add Terminal on every route, so the three
  // read as one cluster rather than one that comes and goes with the page.
  //
  // Nets are a per-squadron library, so the button still has to answer "whose".
  // /nets/:section and /pace/:section name one, and the drawer opens straight
  // onto it. Everywhere else there is no squadron in the URL, so it lands on the
  // nets picker instead of guessing one -- a net filed under the wrong squadron
  // is worse than one extra click, and squadrons are not interchangeable.
  //
  // The match stays anchored to the end of the path, which now decides the
  // DESTINATION rather than whether the button exists. /pace/:section/edit is
  // still deliberately excluded: the PACE editor holds one draft for the whole
  // card and an SPA navigation away from it discards every unsaved change with
  // no beforeunload to catch it. From there the button goes to the picker like
  // any other non-section route, so the click costs a squadron choice instead of
  // a draft.
  //
  // hasPaceCard is checked too, since a section without a card has no nets page
  // to land on either.
  const paceSectionMatch = /^\/(?:nets|pace)\/([^/]+)\/?$/.exec(location.pathname);
  const matchedSection = paceSectionMatch?.[1];
  const { hasCard } = usePaceSections();
  const netSection = matchedSection && hasCard(matchedSection) ? matchedSection : null;
  const addNetHref = netSection ? `/nets/${netSection}?drawer=add` : '/nets';
  const { user, isAuthenticated, role, canWrite, canWritePace, isAdmin, isPlanner, canSeeContracts } = useAuth();
  // A user has exactly one role: user/service.go replaces the array outright
  // (`target.Roles = []string{req.Role}`), so this renders one badge and the
  // menu one description, with no plural heading.
  //
  // It still maps over roles[] rather than reading `role`, because that costs a
  // line and degrades correctly on the array the API did not write - see the
  // hasRole comment in auth-context.tsx, where an admin whose array began with a
  // legacy pre-RBAC value kept every admin power and displayed as something
  // else. Filtering through ROLES keeps an Entra group name out of a coloured
  // pill rather than shouting it in uppercase.
  const shownRoles = (user?.roles ?? []).filter((r): r is Role => ROLES.includes(r as Role));
  const logoutMutation = useLogout();
  // Drop the items whose gate the viewer does not hold, then the ones a
  // planner is spared. Gated routes are additionally guarded server-side.
  const gates = { isAdmin, canSeeContracts } as const;
  const visibleNavItems = navItems.filter(
    (n) => (!n.gate || gates[n.gate]) && !(n.hideFromPlanner && isPlanner),
  );
  const currentPage = visibleNavItems.find((n) =>
    [n.path, ...(n.alsoMatches ?? [])].some((p) => location.pathname.startsWith(p)),
  );
  const [pageMenuAnchor, setPageMenuAnchor] = useState<null | HTMLElement>(null);
  const pageMenuOpen = Boolean(pageMenuAnchor);

  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null);
  const addMenuOpen = Boolean(addMenuAnchor);

  const [accountAnchor, setAccountAnchor] = useState<null | HTMLElement>(null);
  const accountMenuOpen = Boolean(accountAnchor);

  const handlePageButtonClick = (e: MouseEvent<HTMLElement>) => setPageMenuAnchor(e.currentTarget);
  const handlePageMenuClose = () => setPageMenuAnchor(null);

  const handleNavigation = (path: string) => {
    handlePageMenuClose();
    void navigate(path);
  };

  const handleAddMenuClose = () => setAddMenuAnchor(null);
  const handleAdd = (path: string) => {
    handleAddMenuClose();
    void navigate(path);
  };

  const handleAccountOpen = (e: MouseEvent<HTMLElement>) => setAccountAnchor(e.currentTarget);
  const handleAccountClose = () => setAccountAnchor(null);

  const handleLogout = () => {
    handleAccountClose();
    logoutMutation.mutate();
  };



  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      {/* Own gutters: 20px inset on the left, 14px between the left cluster's
          items; the right cluster sets its own, tighter gap below. On the
          right, the content line plus the scrollbar of #main-content, so the
          lockup's last bar ends where the catalog cards and the browse search
          field end. */}
      <Toolbar disableGutters sx={{ gap: '14px', pl: 2.5, pr: `${String(CONTENT_LINE + SCROLLBAR_W)}px` }}>
        {/* Sidebar toggle. ml: -1 rather than edge="start" (-12px): with the
            button's own 8px padding that puts the glyph, not the box, at the
            20px inset. */}
        <IconButton
          color="inherit"
          aria-label={sidebarOpen ? 'close sidebar' : 'open sidebar'}
          onClick={onMenuClick}
          sx={{ ml: -1 }}
        >
          {/* Every size in this bar steps up about 1.17x from md, together with
              the outlined set in header-trigger-sx.ts - see HEADER_CONTROL_H for
              why it is all of them at once and why phones keep the smaller set. */}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {!sidebarOpen
              ? <ChevronRightIcon sx={{ fontSize: { xs: 18, md: 21 }, opacity: 0.6, mr: -0.5 }} />
              : <ChevronLeftIcon sx={{ fontSize: { xs: 18, md: 21 }, opacity: 0.6, mr: -0.5 }} />
            }
            <MenuIcon sx={{ fontSize: { xs: 24, md: 28 } }} />
          </Box>
        </IconButton>
        {/* Rendered with the toggle, never on its own: a rule with nothing to
            its left is a stray stroke at the bar's edge. */}
        <HeaderRule />

        {/* Page nav button. No horizontal padding: with it, the gap to the
            rule read as 20px against 10px everywhere else. */}
        <Box
          component="button"
          onClick={handlePageButtonClick}
          aria-haspopup="true"
          aria-controls={pageMenuOpen ? 'page-nav-menu' : undefined}
          aria-expanded={pageMenuOpen ? 'true' : undefined}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'inherit', borderRadius: '8px', px: 0, py: 0.75,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            transition: 'background .12s',
          }}
        >
          {/* `& svg` rather than a prop on the icon: the page icons are shared
              with the page menu below, which keeps its own size. */}
          <Box sx={{ color: 'primary.light', display: 'flex', alignItems: 'center', '& svg': { fontSize: { xs: 20, md: 22 } } }}>
            {currentPage?.icon ?? <DashboardIcon fontSize="small" />}
          </Box>
          <Typography variant="h6" noWrap sx={{ fontWeight: 600, fontSize: { xs: '1rem', md: '1.1rem' } }}>
            {currentPage?.label ?? 'Signal Suite'}
          </Typography>
          <ExpandMoreIcon sx={{ fontSize: { xs: 16, md: 18 }, opacity: 0.6, transform: pageMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
        </Box>
        <HeaderRule />

        {/* Export / Template / Import, immediately right of the page dropdown.
            Identical on every route: the dataset is chosen in the dialog, not
            implied by the page, which is the only way Waveforms, Services and
            Transports are reachable at all. Left-anchored so the right-anchored
            Add cluster keeps its position. */}
        <CsvHeaderControls />

        {/* The `?` joins the left cluster rather than being centred.
            It was centred between the two clusters, which meant the page
            picker moved it: the picker sizes to its own label, so across the
            nine labels the button drifted 26.7px (x=653.5 on Kits against
            x=680.2 on Dashboard). Reserving the widest label would have pinned
            it, but the middle of the bar was the wrong home: a centred control
            on one axis invites a second beneath it to read as a designed
            pair, which is why the page banners keep their actions at the
            edges. Packed left there is no width to reserve and nothing to
            hold still.

            One spacer now, after it, which is what keeps the account cluster
            hard right. */}
        <HelpButton />
        <Box sx={{ flexGrow: 1 }} />

        {/* Page picker menu */}
        <Menu
          id="page-nav-menu"
          anchorEl={pageMenuAnchor}
          open={pageMenuOpen}
          onClose={handlePageMenuClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          slotProps={{
            paper: {
              elevation: 3,
              sx: { minWidth: 180, mt: 0.5, borderRadius: '8px', border: '1px solid', borderColor: 'divider' },
            },
          }}
        >
          {visibleNavItems.map((item) => {
            const active = location.pathname.startsWith(item.path);
            return (
              <MenuItem
                key={item.path}
                selected={active}
                onClick={() => { if (!item.disabled) handleNavigation(item.path); else handlePageMenuClose(); }}
                sx={{ gap: 1.5, borderRadius: '4px', mx: 0.5, my: 0.25, opacity: item.disabled ? 0.45 : 1 }}
              >
                <Box sx={{ color: active ? 'primary.main' : 'text.secondary', display: 'flex' }}>
                  {item.icon}
                </Box>
                <Typography variant="body2" sx={{
                  fontWeight: active ? 700 : 400
                }}>
                  {item.label}
                </Typography>
              </MenuItem>
            );
          })}
        </Menu>

        {/* The gap is the spacing for everything in here; see HEADER_CLUSTER_GAP. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: `${String(HEADER_CLUSTER_GAP)}px` }}>


          {/* Permanent Add actions - available on every route, not just the
              matching domain page. Each navigates to its own page and opens the
              add drawer there; mutating the current URL's `drawer` param instead
              would open whichever drawer the current page happens to own. */}
          {/* One `+` rather than three buttons. The bar carried six controls
              across two clusters and was already dropping the CSV labels below
              md to stop the AppBar overflowing; collapsing both clusters is what
              buys the room back.

              Gated on `canWrite || canWritePace`, which is exactly the predicate
              the divider below already used - a viewer can add nothing, and an
              empty menu is worse than no button. It always opens as a menu, even
              for rto and planner, who see only Add Net: a control that changes
              shape with the viewer's role is harder to describe and harder to
              test than one that does not.

              Add Net is gated on canWritePace, not canWrite: rto and planner
              write nets but not kits or terminals, so folding it in with the
              other two would hide it from exactly the roles the PACE Planner is
              built for.

              Each item navigates to its own page and opens the add drawer there;
              mutating the current URL's `drawer` param instead would open
              whichever drawer the current page happens to own. */}
          {(canWrite || canWritePace) && (
            <>
              <Tooltip title="Add">
                <Button
                  variant="outlined"
                  size="small"
                  disableElevation
                  aria-label="add"
                  aria-haspopup="true"
                  aria-controls={addMenuOpen ? 'add-menu' : undefined}
                  aria-expanded={addMenuOpen ? 'true' : undefined}
                  onClick={(e: MouseEvent<HTMLElement>) => setAddMenuAnchor(e.currentTarget)}
                  sx={HEADER_TRIGGER_SX}
                >
                  <AddIcon sx={{ fontSize: ADD_ICON_FONT_SIZE }} />
                </Button>
              </Tooltip>

              <Menu
                id="add-menu"
                anchorEl={addMenuAnchor}
                open={addMenuOpen}
                onClose={handleAddMenuClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{
                  paper: {
                    elevation: 3,
                    sx: { minWidth: 200, mt: 0.5, borderRadius: '8px', border: '1px solid', borderColor: 'divider' },
                  },
                }}
              >
                {canWrite && (
                  <MenuItem
                    onClick={() => handleAdd('/terminals?drawer=add')}
                    sx={{ gap: 1.5, borderRadius: '4px', mx: 0.5, my: 0.25 }}
                  >
                    <Box sx={{ color: 'text.secondary', display: 'flex' }}><SatelliteDishIcon /></Box>
                    <Typography variant="body2">Add Terminal</Typography>
                  </MenuItem>
                )}

                {canWrite && (
                  <MenuItem
                    onClick={() => handleAdd('/kits?drawer=add')}
                    sx={{ gap: 1.5, borderRadius: '4px', mx: 0.5, my: 0.25 }}
                  >
                    <Box sx={{ color: 'text.secondary', display: 'flex' }}><RouterIcon fontSize="small" /></Box>
                    <Typography variant="body2">Add Kit</Typography>
                  </MenuItem>
                )}

                {canWritePace && (
                  <MenuItem
                    onClick={() => handleAdd(addNetHref)}
                    sx={{ gap: 1.5, borderRadius: '4px', mx: 0.5, my: 0.25 }}
                  >
                    <Box sx={{ color: 'text.secondary', display: 'flex' }}><SettingsInputAntennaIcon fontSize="small" /></Box>
                    <Typography variant="body2">Add Net</Typography>
                  </MenuItem>
                )}
              </Menu>
            </>
          )}

          {/* Same gate as the `+`: the rule separates it from the API icon, and
              with no `+` there is nothing to separate. */}
          {(canWrite || canWritePace) && <HeaderRule />}

          {/* API Documentation. An icon-only button, so it meets the cluster
              gap by its glyph - see HEADER_ICON_BUTTON_SX. */}
          <Tooltip title="API Documentation">
            <IconButton
              color="inherit"
              component="a"
              href="/api/docs"
              sx={HEADER_ICON_BUTTON_SX}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="API documentation"
            >
              <ApiIcon sx={{ fontSize: { xs: 24, md: 28 } }} />
            </IconButton>
          </Tooltip>

          {/* User menu */}
          {isAuthenticated && (
            <>
              {/* Always rendered, unlike the CSV labels beside it. Those collapse to
                  an icon that still means "export"; a role pill collapsed to an icon
                  means nothing, and the pill is ~46px, so there is nothing to buy by
                  dropping it. The account menu carries the same role with its
                  description for anyone who wants more than the glance. */}
              {role && <RoleBadge role={role} size="sm" aria-label={`your role: ${role}`} />}

              <Tooltip title="Account settings">
                <IconButton
                  onClick={handleAccountOpen}
                  size="small"
                  aria-controls={accountMenuOpen ? 'account-menu' : undefined}
                  aria-haspopup="true"
                  aria-expanded={accountMenuOpen ? 'true' : undefined}
                  aria-label="account menu"
                  sx={HEADER_SMALL_ICON_BUTTON_SX}
                >
                  {/* The circle is HEADER_CONTROL_H, one height with the
                      outlined controls and the rules; it was 36px, the tallest
                      thing in the bar for a control that only opens a menu.
                      The initial shrinks less than the circle did (20px to 17)
                      so it still reads as a letter, not a dot. */}
                  <Avatar sx={{ width: HEADER_CONTROL_H, height: HEADER_CONTROL_H, fontSize: { xs: 14, md: 17 }, bgcolor: 'secondary.main' }}>
                    {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                  </Avatar>
                </IconButton>
              </Tooltip>

              <Menu
                id="account-menu"
                anchorEl={accountAnchor}
                open={accountMenuOpen}
                onClose={handleAccountClose}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                slotProps={{
                  paper: {
                    elevation: 0,
                    sx: {
                      overflow: 'visible',
                      filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                      mt: 1.5, minWidth: 260,
                    },
                  },
                }}
              >
                <Box sx={{ px: 2, py: 1 }}>
                  <Typography variant="subtitle1">{user?.name}</Typography>
                  <Typography variant="body2" sx={{
                    color: 'text.secondary'
                  }}>{user?.email}</Typography>
                  {shownRoles.map((r) => (
                    <Box key={r} sx={{ mt: 1 }}>
                      <RoleBadge role={r} size="sm" />
                      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5 }}>
                        {roleDescription(r)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
                <Divider />
                <MenuItem onClick={handleLogout}>
                  <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                  Logout
                </MenuItem>
              </Menu>
            </>
          )}

          {/* The product lockup, hard right, for every auth state. The mark's
              box is its ink, so it meets the cluster gap with nothing added. */}
          <HeaderRule />
          <SignalSuiteMark />
        </Box>
      </Toolbar>
    </AppBar>
  );
}
