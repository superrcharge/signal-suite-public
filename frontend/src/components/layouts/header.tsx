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
// Router over the generic Widgets squares - kits are network gear, and
// this is the closest stock match to a router appliance (chassis body
// with status lights and antennas).
import RouterIcon from '@mui/icons-material/Router';
import { PaceIcon } from '@/components/common/pace-icon';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
// The Comms Library rows of the `+` menu. Each is a glyph for what the
// library holds rather than for "library": a waveform trace, a SATCOM ground
// segment, a wired path, an airframe. help-dialog.tsx draws the same set.
// There is no Add Organization row: organizations are visible only inside
// Operations and are added from the Join Operation wizard's Add to library.
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import CellTowerIcon from '@mui/icons-material/CellTower';
import CableIcon from '@mui/icons-material/Cable';
import FlightIcon from '@mui/icons-material/Flight';
import { useState, MouseEvent, type ReactNode } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router';
import { useAuth } from '@/contexts';
import { useLogout } from '@/services';
import { usePaceSections } from '@/components/pace/use-pace-sections';
import { parseTheater } from '@/components/pace/theater';
import { netsLibraryPath, type NetCreated } from '@/components/pace/net-landing';
import { NetDrawer } from '@/pages/net-drawer';
import { LIBRARIES, libraryQuery, type LibraryKey } from '@/components/catalog/library-keys';
import { CsvHeaderControls } from '@/components/common/csv/csv-header-controls';
import { HelpButton } from '@/components/help/help-button';
import { CrosshairIcon } from '@/components/common/crosshair-icon';
import { SatelliteDishIcon, visibleNavItems } from './nav-items';
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

/**
 * The bar's left inset, in px. Named because two things derive from it: the
 * Toolbar's left padding and the width of the left cluster, which ends at
 * `sidebarWidth` so that its closing rule sits on the sidebar's border.
 */
const HEADER_INSET = 20;

/**
 * A row of the `+` menu.
 *
 * `gate` names the flag that must hold for the row to render, in the same
 * vocabulary `CsvWriteGate` uses in csv-domains.ts, and it is the flag the
 * DESTINATION already gates on: a row here is an advertisement for a control
 * that exists on the page it lands on, so it must show for exactly the roles
 * that find the control there. The pane table in authz.md is the authority.
 *
 * `group` decides where a divider goes: one wherever the visible rows change
 * group. The first three rows open an add drawer; the library rows land on
 * the Comms Library, whose add form is inline at the top of the pane; the
 * operation row is its own group at the bottom.
 *
 * A row either navigates (`href`) or acts in place (`onSelect`). Add Net is
 * the in-place one: its drawer is mounted here, because a net belongs to a
 * squadron and no page but a squadron's own can host the question.
 */
type AddGate = 'canWrite' | 'canWriteRadio' | 'canWritePace';

interface AddItem {
  label: string;
  icon: ReactNode;
  gate: AddGate;
  href?: string;
  onSelect?: () => void;
  group: 'record' | 'library' | 'operation';
}

/**
 * The Comms Library rows, keyed so a fifth library cannot be added to the chip
 * row without this compiling red. Order comes from `LIBRARIES`, not from here,
 * so the menu reads in the order the chips do.
 */
const LIBRARY_ADD: Record<LibraryKey, { singular: string; icon: ReactNode; gate: AddGate }> = {
  waveforms:  { singular: 'Waveform',  icon: <GraphicEqIcon fontSize="small" />, gate: 'canWriteRadio' },
  services:   { singular: 'Service',   icon: <CellTowerIcon fontSize="small" />, gate: 'canWrite' },
  transports: { singular: 'Transport', icon: <CableIcon fontSize="small" />,     gate: 'canWritePace' },
  platforms:  { singular: 'Platform',  icon: <FlightIcon fontSize="small" />,    gate: 'canWritePace' },
};

interface HeaderProps {
  onMenuClick: () => void;
  sidebarOpen: boolean;
  sidebarWidth: number;
}

export function Header({ onMenuClick, sidebarOpen, sidebarWidth }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // Add Net sits beside Add Kit and Add Terminal on every route, so the rows
  // read as one menu rather than one that comes and goes with the page.
  //
  // Nets are a per-squadron library, so the button still has to answer "whose".
  // It answers it inside the drawer: a Squadron select, first field, which the
  // user sees and can change before Create. The drawer opens right here, over
  // whatever page is on screen, the way Add Terminal and Add Kit open theirs -
  // it used to navigate to the squadron's nets page first, or to the picker
  // from any route that named none, and both read as being sent somewhere
  // else before being allowed to add.
  //
  // The URL only seeds the select. /nets/:section and /pace/:section/... name
  // a squadron, so the common case is a glance; anywhere else it starts empty
  // and the drawer refuses to create until one is chosen - a net filed under
  // the wrong squadron cannot be moved, only deleted and typed in again. The
  // match is a prefix, so the editor and print routes seed too: nothing
  // navigates on open, so the editor's draft is not at risk from the click.
  //
  // hasPaceCard is checked, since only a section with a card holds nets.
  const paceSectionMatch = /^\/(?:nets|pace)\/([^/]+)/.exec(location.pathname);
  const matchedSection = paceSectionMatch?.[1];
  const { sections: squadrons, hasCard } = usePaceSections();
  const netSection = matchedSection && hasCard(matchedSection) ? matchedSection : '';
  // The theater rides along, so Add Net from an OCONUS list opens the drawer
  // in OCONUS. A pure parse of location.search: no service hook, which the
  // header's closed test mocks would otherwise all have to stub.
  const theater = parseTheater(new URLSearchParams(location.search).get('theater'));
  // Mounted on the click and unmounted on close, never held open with a prop:
  // the drawer calls the two net mutation hooks, and mounting it on every
  // route would put them in every closed `@/services` mock that renders
  // MainLayout. Same rule as the CSV dialogs.
  const [addNetOpen, setAddNetOpen] = useState(false);
  // After Create, land on the new net: that squadron's library, on the tab
  // and theater it is visible under (net-landing.ts). The one route that
  // stays put is the PACE editor, which holds an unsaved draft for the whole
  // card that an SPA navigation would discard; there the toast names the
  // squadron and the editor keeps the screen.
  const onPaceEditor = /^\/pace\/[^/]+\/edit\/?$/.test(location.pathname);
  const handleNetCreated = (created: NetCreated) => {
    setAddNetOpen(false);
    if (onPaceEditor) return;
    void navigate(netsLibraryPath(created, new URLSearchParams(location.search)));
  };
  const { user, isAuthenticated, role, canWrite, canWriteRadio, canWritePace, isAdmin, isPlanner, canSeeContracts, canSeeTrackers } = useAuth();
  // The `+` menu, in the order the app introduces each thing top to bottom
  // and left to right: the Terminals and Kits sidebar groups, the Nets Library
  // under PACE Planning, then the Comms Library chips in chip order, and
  // Add Operation last. Every row is gated on the flag its destination gates
  // on - see AddItem.
  const addItems: AddItem[] = [
    { label: 'Add Terminal', icon: <SatelliteDishIcon />, gate: 'canWrite', href: '/terminals?drawer=add', group: 'record' },
    { label: 'Add Kit', icon: <RouterIcon fontSize="small" />, gate: 'canWrite', href: '/kits?drawer=add', group: 'record' },
    { label: 'Add Net', icon: <PaceIcon fontSize="small" />, gate: 'canWritePace', onSelect: () => setAddNetOpen(true), group: 'record' },
    ...LIBRARIES.map((lib): AddItem => ({
      label: `Add ${LIBRARY_ADD[lib.key].singular}`,
      icon: LIBRARY_ADD[lib.key].icon,
      gate: LIBRARY_ADD[lib.key].gate,
      href: `/catalog/comms-library${libraryQuery(lib.key)}`,
      group: 'library',
    })),
    // Last, below every library row: it will be the least frequently clicked
    // item, and Operations sits at the bottom of the sidebar too.
    { label: 'Add Operation', icon: <CrosshairIcon fontSize="small" />, gate: 'canWritePace', href: '/operations?drawer=add', group: 'operation' },
  ];
  const addGates = { canWrite, canWriteRadio, canWritePace } as const;
  const visibleAddItems = addItems.filter((item) => addGates[item.gate]);
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
  const navItems = visibleNavItems({ isAdmin, canSeeContracts, canSeeTrackers, isPlanner });
  const currentPage = navItems.find((n) =>
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
  const handleAdd = (item: AddItem) => {
    handleAddMenuClose();
    if (item.onSelect) item.onSelect();
    else if (item.href) void navigate(item.href);
  };

  const handleAccountOpen = (e: MouseEvent<HTMLElement>) => setAccountAnchor(e.currentTarget);
  const handleAccountClose = () => setAccountAnchor(null);

  const handleLogout = () => {
    handleAccountClose();
    logoutMutation.mutate();
  };



  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      {/* Own gutters: HEADER_INSET on the left, 14px between the clusters and
          the loose controls after them; the two clusters set their own,
          tighter gap. On the right, the content line plus the scrollbar of
          #main-content, so the lockup's last bar ends where the catalog cards
          and the browse search field end. */}
      <Toolbar disableGutters sx={{ gap: '14px', pl: `${String(HEADER_INSET)}px`, pr: `${String(CONTENT_LINE + SCROLLBAR_W)}px` }}>
        {/* The left cluster: toggle, rule, page picker, rule. Its width is
            fixed so that it ends exactly at the sidebar's edge and its closing
            rule lands on the sidebar's 1px border, on every route and whether
            or not the sidebar is open. Without the fixed width the picker sized
            to its label and the rule wandered 54px across the nine pages
            (x=201 on Kits, x=255 on Dashboard) while the border sat at 239.
            HEADER_CLUSTER_GAP rather than the Toolbar's 14px, because the
            widest label only fits inside the 220px at the tighter gap. */}
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: `${String(HEADER_CLUSTER_GAP)}px`,
            flexShrink: 0, width: sidebarWidth - HEADER_INSET,
          }}
        >
          {/* Sidebar toggle. HEADER_ICON_BUTTON_SX cancels the button's own 8px
              padding on both sides, so the glyph, not the box, sits at the inset
              and the gap to the rule is measured from its ink - the same rule
              the right cluster's icon buttons follow. */}
          <IconButton
            color="inherit"
            aria-label={sidebarOpen ? 'close sidebar' : 'open sidebar'}
            onClick={onMenuClick}
            sx={HEADER_ICON_BUTTON_SX}
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

          {/* Page nav button. It fills the cluster's remaining width, so the
              rule after it holds still; icon, label and chevron stay one group,
              centred in that width, so the slack a short label leaves falls
              evenly either side rather than piling up before the rule. No
              horizontal padding: the cluster's gap is the spacing.

              The width is 143px at md and the widest group, Dashboard, is
              138.4 of it at the 6px inner gap; at the 8px gap the fit was
              0.3px, which one fallback font would have turned into an
              ellipsis. A label that no longer fits shows as one. */}
          <Box
            component="button"
            onClick={handlePageButtonClick}
            aria-haspopup="true"
            aria-controls={pageMenuOpen ? 'page-nav-menu' : undefined}
            aria-expanded={pageMenuOpen ? 'true' : undefined}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
              flex: 1, minWidth: 0,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'inherit', borderRadius: '8px', px: 0, py: 0.75,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
              transition: 'background .12s',
            }}
          >
            {/* `& svg` rather than a prop on the icon: the page icons are shared
                with the page menu below, which keeps its own size. */}
            <Box sx={{ color: 'primary.light', display: 'flex', alignItems: 'center', '& svg': { fontSize: { xs: 20, md: 22 } } }}>
              {currentPage ? <currentPage.Icon fontSize="small" /> : <DashboardIcon fontSize="small" />}
            </Box>
            <Typography variant="h6" noWrap sx={{ fontWeight: 600, fontSize: { xs: '1rem', md: '1.1rem' } }}>
              {currentPage?.label ?? 'Signal Suite'}
            </Typography>
            <ExpandMoreIcon sx={{ fontSize: { xs: 16, md: 18 }, opacity: 0.6, transform: pageMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </Box>
          <HeaderRule />
        </Box>

        {/* Export / Template / Import, immediately right of the page dropdown.
            Identical on every route: the dataset is chosen in the dialog, not
            implied by the page, which is the only way Waveforms, Services and
            Transports are reachable at all. Left-anchored so the right-anchored
            Add cluster keeps its position. */}
        <CsvHeaderControls />

        {/* The `?` joins the left cluster rather than being centred.
            It was centred between the two clusters, which meant the page
            picker moved it: the picker then sized to its own label, so across
            the nine labels the button drifted 26.7px (x=653.5 on Kits against
            x=680.2 on Dashboard). The picker's width is fixed now, for the
            rule's sake, but the middle of the bar was the wrong home anyway: a
            centred control on one axis invites a second beneath it to read as
            a designed pair, which is why the page banners keep their actions
            at the edges. Packed left there is nothing to hold still.

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
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.path);
            return (
              <MenuItem
                key={item.path}
                selected={active}
                onClick={() => { if (!item.disabled) handleNavigation(item.path); else handlePageMenuClose(); }}
                sx={{ gap: 1.5, borderRadius: '4px', mx: 0.5, my: 0.25, opacity: item.disabled ? 0.45 : 1 }}
              >
                <Box sx={{ color: active ? 'primary.main' : 'text.secondary', display: 'flex' }}>
                  <item.Icon fontSize="small" />
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

              Rendered for every role, a viewer included. It used to disappear
              when no row survived its gate, on the argument that an empty menu
              is worse than no button - which is true, and is why the empty
              case is not an empty menu. A viewer who opens it reads why there
              is nothing to add and who to ask, which is the same decision
              authz.md records for the pages: a refusal that says what happened
              beats a control that is simply not there. It always opens as a
              menu for the writing roles too, even a planner with three rows: a
              control that changes shape with the viewer's role is harder to
              describe and harder to test than one that does not.

              Each row is gated on the flag its destination gates on (see
              AddItem), not on `canWrite`: rto and planner write nets, transports
              and platforms but not kits or terminals, so one gate for the whole
              menu would hide rows from exactly the roles the PACE Planner is
              built for.

              Each row navigates to its own page. The first three open the add
              drawer there; mutating the current URL's `drawer` param instead
              would open whichever drawer the current page happens to own. The
              library rows land on the Comms Library with that chip pressed,
              where the add form is the first thing under the banner. */}
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
            {/* Nothing survived the gates: say so, in the space the rows
                would fill. Plain text rather than a disabled MenuItem, which
                would grey out the one thing here the reader needs to read.
                "viewer" is stated rather than read off `role`, because any
                account with no write flag is functionally a viewer, whatever
                its array says - see the hasRole comment in auth-context.tsx. */}
            {visibleAddItems.length === 0 && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ px: 2, py: 1, maxWidth: 280 }}
              >
                As a viewer, you’re not able to add anything to the app - contact an administrator if you require higher permissions.
              </Typography>
            )}

            {/* A divider where the visible rows change group - so a
                planner (Net | Transport, Platform | Operation)
                gets them in the right places too, and an editor with nothing
                on one side of a divider gets none there. */}
            {visibleAddItems.flatMap((item, i) => {
              const previous = visibleAddItems[i - 1];
              const row = (
                <MenuItem
                  key={item.label}
                  onClick={() => handleAdd(item)}
                  sx={{ gap: 1.5, borderRadius: '4px', mx: 0.5, my: 0.25 }}
                >
                  <Box sx={{ color: 'text.secondary', display: 'flex' }}>{item.icon}</Box>
                  <Typography variant="body2">{item.label}</Typography>
                </MenuItem>
              );
              return previous && previous.group !== item.group
                ? [<Divider key={`${item.group}-divider`} sx={{ my: 0.5 }} />, row]
                : [row];
            })}
          </Menu>

          {addNetOpen && (
            <NetDrawer
              open
              section={netSection}
              squadrons={squadrons}
              theater={theater}
              net={null}
              onClose={() => setAddNetOpen(false)}
              onCreated={handleNetCreated}
            />
          )}

          {/* Separates the `+` from the API icon. Unconditional now that the
              `+` is, so every role sees the same four rules. */}
          <HeaderRule />

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
              box is its ink, so it meets the cluster gap with nothing added;
              it is also the home link, so the link adds no padding either. */}
          <HeaderRule />
          <Box
            component={RouterLink}
            to="/dashboard"
            aria-label="Signal Suite - go to Dashboard"
            sx={{
              display: 'flex', lineHeight: 0, color: 'inherit', borderRadius: '2px',
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            <SignalSuiteMark />
          </Box>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
