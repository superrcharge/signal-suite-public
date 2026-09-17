import { useState, type MouseEvent } from 'react';
import {
  Drawer,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Collapse,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import GridOnIcon from '@mui/icons-material/GridOn';
import TuneIcon from '@mui/icons-material/Tune';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useSections, useContractFiscalYears } from '@/services';
import { useAuth } from '@/contexts/auth-context';
import { useSidebarToggle } from '@/hooks';
import { SectionEditDialog } from '@/components/common';
import { HEADER_HEIGHT } from './layout-constants';
import { hasPaceCard } from '@/components/pace/pace-constants';
import type { Section } from '@/types';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  width: number;
  isMobile: boolean;
}

export function Sidebar({ open, onClose, width, isMobile }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: sectionsData } = useSections();
  const { canWrite, canWriteRadio, isPlanner, canSeeContracts } = useAuth();
  // Skipped entirely for a role whose Contracts group is not rendered.
  const { data: fiscalYears } = useContractFiscalYears(canSeeContracts);
  const sections = sectionsData ?? [];

  const [terminalsOpen, toggleTerminals] = useSidebarToggle('terminals');
  const [starshieldOpen, toggleStarshield] = useSidebarToggle('starshield');
  const [paradigmOpen, toggleParadigm] = useSidebarToggle('paradigm');
  const [onewebOpen, toggleOneweb] = useSidebarToggle('oneweb');
  const [sectionsByOpen, toggleSectionsBy] = useSidebarToggle('sectionsBy');
  const [kitsOpen, toggleKits] = useSidebarToggle('kits');
  const [catalogOpen, toggleCatalog] = useSidebarToggle('catalog');
  const [contractsOpen, toggleContracts] = useSidebarToggle('contracts');
  const [paceOpen, togglePace] = useSidebarToggle('pace');
  const [netsOpen, toggleNets] = useSidebarToggle('nets');
  const [wheelsOpen, toggleWheels] = useSidebarToggle('wheels');

  const isTerminalsRoute = location.pathname === '/terminals';
  const isKitsRoute = location.pathname === '/kits';
  const isContractsRoute = location.pathname === '/contracts';
  const isCatalogRoute = location.pathname.startsWith('/catalog');
  // "All Equipment" means the browse view and the sheets under it, not every
  // route that happens to start with /catalog. Each sub-route added here has
  // to be excluded explicitly, which is why this is a named boolean rather
  // than a third `includes` bolted onto three inline expressions.
  const isCatalogBrowse =
    isCatalogRoute &&
    !location.pathname.includes('/edit') &&
    !location.pathname.startsWith('/catalog/compare') &&
    !location.pathname.startsWith('/catalog/comms-library') &&
    !location.pathname.startsWith('/catalog/compatibility');
  const isCompareRoute = location.pathname.startsWith('/catalog/compare');
  const isCommsLibraryRoute = location.pathname.startsWith('/catalog/comms-library');
  // Not caught by isCompareRoute: "compat" and "compar" part at the fifth letter.
  const isCompatibilityRoute = location.pathname.startsWith('/catalog/compatibility');
  const isNetsRoute = location.pathname.startsWith('/nets');
  const isPaceRoute = location.pathname.startsWith('/pace');
  // '/pace/asqd' -> 'asqd'; the bare dashboards leave no squadron highlighted.
  const activePaceSection = location.pathname.startsWith('/pace/')
    ? (location.pathname.split('/')[2] ?? null)
    : null;
  const activeNetsSection = location.pathname.startsWith('/nets/')
    ? (location.pathname.split('/')[2] ?? null)
    : null;

  // Sections filter both lists, so the group stays live on either route and
  // clicking a section keeps you on the page you are already looking at.
  const isEntityRoute = isTerminalsRoute || isKitsRoute;
  const sectionBasePath = isKitsRoute ? '/kits' : '/terminals';

  const activeSections = isEntityRoute
    ? new Set((searchParams.get('sections') ?? '').split(',').filter(Boolean))
    : null;
  const activeModel = isTerminalsRoute ? (searchParams.get('model') ?? null) : null;
  const activeKitType = isKitsRoute ? (searchParams.get('type') ?? null) : null;
  const activeFY = isContractsRoute ? (searchParams.get('fy') ?? 'all') : null;

  const [editingSection, setEditingSection] = useState<Section | null>(null);

  const handleModelClick = (model: string) => {
    void navigate(`/terminals?model=${model}`);
    if (isMobile) onClose();
  };

  // "All Terminals" is a reset, not a section filter: it always lands on the
  // terminals list with every filter cleared, even from the kits route.
  const handleAllTerminalsClick = () => {
    void navigate('/terminals');
    if (isMobile) onClose();
  };

  const handleSectionClick = (key: string) => {
    // Carry the rest of the query string over - only the section filter and
    // any open drawer (which points at a row the new filter may exclude) change.
    const params = new URLSearchParams(searchParams);
    params.delete('drawer');
    params.delete('id');
    params.delete('focus');

    if (key === 'all') {
      params.delete('sections');
    } else {
      const next = new Set(activeSections ?? []);
      if (next.has(key)) next.delete(key); else next.add(key);
      if (next.size === 0) params.delete('sections');
      else params.set('sections', [...next].join(','));
    }

    const qs = params.toString();
    void navigate(`${sectionBasePath}${qs ? `?${qs}` : ''}`);
    if (isMobile) onClose();
  };

  const handleFYClick = (fy: string) => {
    void navigate(fy === 'all' ? '/contracts' : `/contracts?fy=${fy}`);
    if (isMobile) onClose();
  };

  const handleKitTypeClick = (type: string) => {
    void navigate(type === 'all' ? '/kits' : `/kits?type=${type}`);
    if (isMobile) onClose();
  };

  const handleEditClick = (e: MouseEvent<HTMLElement>, sec: Section) => {
    e.stopPropagation();
    setEditingSection(sec);
  };

  /**
   * A group header drawn as a full-bleed banner: a rule above and below, the
   * title in text.primary so it outranks the rows beneath it, the chevron on
   * the right edge. Flat - no background, radius or shadow. The banner's own
   * top rule replaced the standalone Dividers that used to sit above each
   * group; both together measured 21px above a title against 10px below.
   *
   * The padding is asymmetric on purpose. Uppercase Roboto has no descenders,
   * so symmetric padding reads top-heavy; 13 over 10 measures even.
   *
   * Only the bottom rule belongs to the banner. The rule that closes a group
   * and the 14px above it belong to the group's open body (`groupBody`), so a
   * run of collapsed groups stacks banner on banner with one rule between
   * them and no dead space - the first cut had `margin: 14px 0 6px` on every
   * banner, and three collapsed groups showed 20px of empty drawer between
   * each pair. It also makes the first banner flush under the header with no
   * special case. The 44px right padding reserves the chevron's column, so a
   * long title (Equipment Catalog) stops short of it instead of running under.
   *
   * The chevron points down while the group is open and up while closed, the
   * maintainer's reading of the design mock; the family rows below keep the
   * older up-when-open convention at their smaller size.
   */
  const groupLabel = (label: string, expanded: boolean, onToggle: () => void) => (
    <Box
      onClick={onToggle}
      sx={{
        display: 'flex', alignItems: 'center', position: 'relative',
        p: '13px 44px 10px 22px', mb: expanded ? '6px' : 0,
        borderBottom: '1px solid', borderColor: 'divider',
        cursor: 'pointer', userSelect: 'none',
        '&:hover': { opacity: 0.8 },
      }}
    >
      <Typography
        variant="caption"
        component="span"
        sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.primary' }}
      >
        {label}
      </Typography>
      {expanded
        ? <ExpandMoreIcon sx={{ position: 'absolute', right: 12, top: 6, fontSize: 24, color: 'text.secondary' }} />
        : <ExpandLessIcon sx={{ position: 'absolute', right: 12, top: 6, fontSize: 24, color: 'text.secondary' }} />}
    </Box>
  );

  /**
   * The open body of a group: its rows, 14px of air, and the rule that closes
   * it. Inside the Collapse rather than on it, because a Collapse at height 0
   * still paints its own border - the inner box's is clipped with the rest.
   */
  const groupBody = (open: boolean, children: React.ReactNode) => (
    <Collapse in={open}>
      <Box sx={{ pb: '14px', borderBottom: '1px solid', borderColor: 'divider' }}>
        {children}
      </Box>
    </Collapse>
  );

  const navItem = ({
    navKey, label, color, active, onClick, editBtn,
  }: {
    navKey?: string;
    label: string;
    color?: string;
    active: boolean;
    onClick: () => void;
    editBtn?: React.ReactNode;
  }) => (
    <ListItem key={navKey} disablePadding>
      <ListItemButton
        selected={active}
        onClick={onClick}
        sx={{
          borderRadius: 0,
          py: '5px',
          px: '14px',
          mb: 0.25,
          position: 'relative',
          pr: editBtn ? 4.5 : '14px',
          '&.Mui-selected': { bgcolor: 'action.selected' },
          '&.Mui-selected::before': {
            content: '""',
            position: 'absolute',
            left: 0, top: 4, bottom: 4, width: 3,
            borderRadius: '0 2px 2px 0',
            bgcolor: color ?? 'primary.main',
          },
          '&:hover .sidebar-edit-btn, &:focus-within .sidebar-edit-btn': { opacity: 1 },
        }}
      >
        {/* Pip 10 + gap 10. The pip is the section's own colour when it has
            one; the fallback is the theme's primary, the same source the
            active bar above reads, so the two cannot disagree. (It used to
            fall back through a --color-primary variable nothing defined.) */}
        <ListItemIcon sx={{ minWidth: 20 }}>
          <Box sx={{
            width: 10, height: 10, borderRadius: '50%',
            border: '2px solid', borderColor: color ?? 'primary.main',
            bgcolor: active ? (color ?? 'primary.main') : 'transparent',
          }} />
        </ListItemIcon>
        <ListItemText
          primary={label}
          slotProps={{ primary: { variant: 'body2', sx: { fontSize: '0.925rem', fontWeight: active ? 700 : 600, color: active ? 'text.primary' : 'text.secondary' } } }}
        />
        {editBtn}
      </ListItemButton>
    </ListItem>
  );

  const familyLabel = (label: string, expanded: boolean, onToggle: () => void) => (
    <ListItem disablePadding>
      <ListItemButton
        onClick={onToggle}
        sx={{ borderRadius: 0, mb: 0.25, py: '5px', pl: '34px', pr: 1.5, '&:hover': { bgcolor: 'action.hover' } }}
      >
        <ListItemText
          primary={
            <Typography variant="caption" sx={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
              {label}
            </Typography>
          }
        />
        {expanded
          ? <ExpandLessIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
          : <ExpandMoreIcon sx={{ fontSize: 13, color: 'text.secondary' }} />}
      </ListItemButton>
    </ListItem>
  );

  /**
   * A family label that is also a link: clicking the text navigates to that
   * subsection's dashboard, and the chevron alone collapses it.
   *
   * Clicking the label never collapses -- navigating and then hiding the thing
   * you navigated to reads as a glitch.
   */
  const familyNavLabel = (
    label: string,
    expanded: boolean,
    onToggle: () => void,
    onNavigate: () => void,
    active: boolean,
  ) => (
    <ListItem disablePadding>
      <ListItemButton
        onClick={() => { if (!expanded) onToggle(); onNavigate(); }}
        sx={{ borderRadius: 0, mb: 0.25, py: '5px', pl: '34px', pr: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
      >
        <ListItemText
          primary={
            <Typography variant="caption" sx={{
              fontSize: '0.8rem', fontWeight: active ? 700 : 700,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              color: active ? 'primary.main' : 'text.secondary',
            }}>
              {label}
            </Typography>
          }
        />
        <IconButton
          size="small"
          aria-label={expanded ? `collapse ${label}` : `expand ${label}`}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          sx={{ p: 0.25, color: 'text.secondary' }}
        >
          {expanded
            ? <ExpandLessIcon sx={{ fontSize: 13 }} />
            : <ExpandMoreIcon sx={{ fontSize: 13 }} />}
        </IconButton>
      </ListItemButton>
    </ListItem>
  );

  const allItem = (label: string, active: boolean, onClick: () => void) => (
    <ListItem disablePadding>
      <ListItemButton
        onClick={onClick}
        sx={{ borderRadius: 0, mb: 0.25, py: '5px', pl: '34px', '&:hover': { bgcolor: 'action.hover' } }}
      >
        <ListItemText
          primary={
            <Typography variant="caption" sx={{
              fontSize: '0.8rem',
              fontWeight: active ? 700 : 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: active ? 'primary.main' : 'text.secondary',
            }}>
              {label}
            </Typography>
          }
        />
      </ListItemButton>
    </ListItem>
  );

  const drawerContent = (
    <Box sx={{ overflow: 'auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Clears the fixed AppBar. The brand block that stood here was the
          only thing offsetting the drawer's content under the 64px header
          (main-layout offsets #main-content alone); the product identity now
          lives in the header's right cluster as the Signal Suite lockup.
          theme.custom rather than main-layout's HEADER_HEIGHT: that file
          imports this one, and a back-import is a chunk cycle. */}
      <Box sx={{ height: `${String(HEADER_HEIGHT)}px`, flexShrink: 0 }} />

      {/* No horizontal padding: the banners run full-bleed and every row
          carries its own inset, 34px for a top-level row and 54px for the
          box a navItem sits in. First banner flush under the header. */}
      <Box sx={{ pb: 1, flex: 1, overflow: 'auto' }}>
        {!isPlanner && (
          <>
          {/* ── Terminals group ── */}
          {groupLabel('Terminals:', terminalsOpen, toggleTerminals)}
          {groupBody(terminalsOpen, (
            <>
            {allItem(
              'All Terminals',
              isTerminalsRoute && activeSections !== null && activeSections.size === 0 && activeModel === null,
              handleAllTerminalsClick,
            )}

            {/* ── Starshield family ── */}
            {familyLabel('Starshield', starshieldOpen, toggleStarshield)}
            <Collapse in={starshieldOpen}>
              <Box sx={{ pl: '54px' }}>
                {navItem({ label: 'Mini', active: activeModel === 'mini', onClick: () => handleModelClick('mini') })}
                {navItem({ label: 'HP',   active: activeModel === 'hp',   onClick: () => handleModelClick('hp')   })}
              </Box>
            </Collapse>

            {/* ── Paradigm family ── */}
            {familyLabel('Paradigm', paradigmOpen, toggleParadigm)}
            <Collapse in={paradigmOpen}>
              <Box sx={{ pl: '54px' }}>
                {navItem({ label: 'Hornet', active: activeModel === 'hornet', onClick: () => handleModelClick('hornet') })}
                {navItem({ label: 'Ragno',  active: activeModel === 'ragno',  onClick: () => handleModelClick('ragno')  })}
              </Box>
            </Collapse>

            {/* ── OneWeb family ── */}
            {familyLabel('OneWeb', onewebOpen, toggleOneweb)}
            <Collapse in={onewebOpen}>
              <Box sx={{ pl: '54px' }}>
                {navItem({ label: 'OW-7',  active: activeModel === 'ow7',  onClick: () => handleModelClick('ow7')  })}
                {navItem({ label: 'OW-10', active: activeModel === 'ow10', onClick: () => handleModelClick('ow10') })}
                {navItem({ label: 'OW-11', active: activeModel === 'ow11', onClick: () => handleModelClick('ow11') })}
              </Box>
            </Collapse>
            </>
          ))}

          {/* ── Kits group ── */}
          {groupLabel('Kits:', kitsOpen, toggleKits)}
          {groupBody(kitsOpen, (
            <>
            {/*
              Same reset semantics as "All Terminals" above, so the same active
              condition. handleKitTypeClick('all') navigates to a bare /kits with
              no query string, which clears the section filter as well as the type
              - so the item is only "current" when nothing at all is filtered.
              Testing activeKitType alone left it lit alongside a highlighted
              section, showing two mutually exclusive states as both active.
            */}
            {allItem(
              'All Kits',
              isKitsRoute && activeSections !== null && activeSections.size === 0 && activeKitType === null,
              () => handleKitTypeClick('all'),
            )}
            <Box sx={{ pl: '54px' }}>
              {navItem({ label: 'Remote', active: activeKitType === 'remote', onClick: () => handleKitTypeClick('remote') })}
              {navItem({ label: 'IFK',    active: activeKitType === 'ifk',    onClick: () => handleKitTypeClick('ifk')    })}
              {navItem({ label: 'ATK',    active: activeKitType === 'atk',    onClick: () => handleKitTypeClick('atk')    })}
            </Box>
            </>
          ))}

          {groupLabel('By Section:', sectionsByOpen, toggleSectionsBy)}
          {groupBody(sectionsByOpen, (
            <>
            {allItem(
              'All Sections',
              isEntityRoute && activeSections !== null && activeSections.size === 0,
              () => handleSectionClick('all'),
            )}
            <Box sx={{ pl: '54px' }}>
            {sections.map((sec) => {
              const isActive = activeSections?.has(sec.key) ?? false;
              return navItem({
                navKey: sec.key,
                label: sec.label,
                color: sec.color,
                active: isActive,
                onClick: () => handleSectionClick(sec.key),
                editBtn: canWrite ? (
                  <Tooltip title="Edit section">
                    <IconButton
                      className="sidebar-edit-btn"
                      size="small"
                      onClick={(e) => handleEditClick(e, sec)}
                      sx={{
                        position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                        opacity: 0, transition: 'opacity .12s', color: 'text.secondary',
                      }}
                      aria-label={`edit ${sec.label}`}
                    >
                      <EditIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                ) : undefined,
              });
            })}
            </Box>
            </>
          ))}

          </>
        )}
        {/* ── Equipment Catalog group ── */}
        {groupLabel('Equipment Catalog', catalogOpen, toggleCatalog)}
        {groupBody(catalogOpen, (
          <>
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => { void navigate('/catalog'); if (isMobile) onClose(); }}
              sx={{ borderRadius: 0, mb: 0.25, py: '5px', pl: '34px', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <ListItemIcon sx={{ minWidth: 26 }}>
                <MenuBookIcon sx={{ fontSize: 16, color: isCatalogBrowse ? 'primary.main' : 'text.secondary' }} />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography variant="caption" sx={{
                    fontSize: '0.8rem', fontWeight: isCatalogBrowse ? 700 : 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: isCatalogBrowse ? 'primary.main' : 'text.secondary',
                  }}>
                    All Equipment
                  </Typography>
                }
              />
            </ListItemButton>
          </ListItem>
          {/* Ungated: comparing is a read, and every catalog read is open. */}
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => { void navigate('/catalog/compare'); if (isMobile) onClose(); }}
              sx={{ borderRadius: 0, mb: 0.25, py: '5px', pl: '34px', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <ListItemIcon sx={{ minWidth: 26 }}>
                <CompareArrowsIcon sx={{ fontSize: 16, color: isCompareRoute ? 'primary.main' : 'text.secondary' }} />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography variant="caption" sx={{
                    fontSize: '0.8rem', fontWeight: isCompareRoute ? 700 : 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: isCompareRoute ? 'primary.main' : 'text.secondary',
                  }}>
                    Compare
                  </Typography>
                }
              />
            </ListItemButton>
          </ListItem>
          {/* canWriteRadio, not canWrite: an rto writer may create and edit
               radio equipment (POST /api/v1/equipment admits rto, narrowed
               per-record to terminal_type = 'radio' in the service), so gating
               this link on canWrite left the role with a write it could reach
               only by typing the URL. The editor itself still refuses a satcom
               draft for that role. See .claude/context/authz.md. */}
          {canWriteRadio && (
            <ListItem disablePadding>
              <ListItemButton
                onClick={() => { void navigate('/catalog/editor'); if (isMobile) onClose(); }}
                sx={{ borderRadius: 0, mb: 0.25, py: '5px', pl: '34px', '&:hover': { bgcolor: 'action.hover' } }}
              >
                <ListItemIcon sx={{ minWidth: 26 }}>
                  <TuneIcon sx={{ fontSize: 16, color: (location.pathname.startsWith('/catalog/editor') || location.pathname.endsWith('/edit')) ? 'primary.main' : 'text.secondary' }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography variant="caption" sx={{
                      fontSize: '0.8rem', fontWeight: (location.pathname.startsWith('/catalog/editor') || location.pathname.endsWith('/edit')) ? 700 : 600,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      color: (location.pathname.startsWith('/catalog/editor') || location.pathname.endsWith('/edit')) ? 'primary.main' : 'text.secondary',
                    }}>
                      Editor
                    </Typography>
                  }
                />
              </ListItemButton>
            </ListItem>
          )}

          {/* Ungated, unlike the Editor above it. Every pane inside carries its
              own write gate, so a viewer browses the three reference tables and
              sees no editing affordances - which is new for Transports, whose
              library had no readable surface anywhere before this. */}
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => { void navigate('/catalog/comms-library'); if (isMobile) onClose(); }}
              sx={{ borderRadius: 0, mb: 0.25, py: '5px', pl: '34px', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <ListItemIcon sx={{ minWidth: 26 }}>
                <LibraryBooksIcon sx={{ fontSize: 16, color: isCommsLibraryRoute ? 'primary.main' : 'text.secondary' }} />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography variant="caption" sx={{
                    fontSize: '0.8rem', fontWeight: isCommsLibraryRoute ? 700 : 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: isCommsLibraryRoute ? 'primary.main' : 'text.secondary',
                  }}>
                    Comms Library
                  </Typography>
                }
              />
            </ListItemButton>
          </ListItem>

          {/* Static and ungated, like Comms Library. No @/services hook here:
              one reached from the sidebar fails every test file that mocks
              @/services with a closed object - checkServiceMocks in
              scripts/verify.mjs is the authority on that. */}
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => { void navigate('/catalog/compatibility'); if (isMobile) onClose(); }}
              sx={{ borderRadius: 0, mb: 0.25, py: '5px', pl: '34px', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <ListItemIcon sx={{ minWidth: 26 }}>
                <GridOnIcon sx={{ fontSize: 16, color: isCompatibilityRoute ? 'primary.main' : 'text.secondary' }} />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography variant="caption" sx={{
                    fontSize: '0.8rem', fontWeight: isCompatibilityRoute ? 700 : 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: isCompatibilityRoute ? 'primary.main' : 'text.secondary',
                  }}>
                    Compatibility
                  </Typography>
                }
              />
            </ListItemButton>
          </ListItem>
          </>
        ))}

        {/* ── PACE Planning group ──
             Two subsections under one heading: the library is where nets are
             maintained, the wheels are where they are arranged. They are
             siblings rather than one nested inside the other, so neither looks
             like a sub-feature of the other. */}
        {groupLabel('PACE Planning', paceOpen, togglePace)}
        {groupBody(paceOpen, (
          <>
          {familyNavLabel(
            'Nets Library',
            netsOpen,
            toggleNets,
            () => { void navigate('/nets'); if (isMobile) onClose(); },
            isNetsRoute,
          )}
          <Collapse in={netsOpen}>
            <Box sx={{ pl: '54px' }}>
              <Box>
                {sections.filter(hasPaceCard).map((sec) =>
                  navItem({
                    navKey: `nets-${sec.key}`,
                    label: sec.label,
                    color: sec.color,
                    active: activeNetsSection === sec.key,
                    onClick: () => { void navigate(`/nets/${sec.key}`); if (isMobile) onClose(); },
                  })
                )}
              </Box>
            </Box>
          </Collapse>

          {familyNavLabel(
            'JEM/MPU5 Wheels',
            wheelsOpen,
            toggleWheels,
            () => { void navigate('/pace'); if (isMobile) onClose(); },
            isPaceRoute,
          )}
          <Collapse in={wheelsOpen}>
            <Box sx={{ pl: '54px' }}>
              <Box>
                {sections.filter(hasPaceCard).map((sec) =>
                  navItem({
                    navKey: `wheels-${sec.key}`,
                    label: sec.label,
                    color: sec.color,
                    active: activePaceSection === sec.key,
                    onClick: () => { void navigate(`/pace/${sec.key}`); if (isMobile) onClose(); },
                  })
                )}
              </Box>
            </Box>
          </Collapse>
          </>
        ))}

        {/* Contracts are internal: admin and editor only, on its own
            flag rather than isPlanner. A decluttered view, not a boundary -
            the reads stay open, as they are for every role. */}
        {canSeeContracts && (
          <>
          {/* ── Contracts group ── */}
          {groupLabel('Contracts', contractsOpen, toggleContracts)}
          {groupBody(contractsOpen, (
            <>
            {allItem(
              'All Contracts',
              activeFY === 'all',
              () => handleFYClick('all'),
            )}
            <Box sx={{ pl: '54px' }}>
              {(fiscalYears ?? []).map((fy) =>
                navItem({
                  navKey: fy,
                  label: fy,
                  active: activeFY === fy,
                  onClick: () => handleFYClick(fy),
                })
              )}
            </Box>
            </>
          ))}
          </>
        )}
      </Box>

      <SectionEditDialog
        open={!!editingSection}
        section={editingSection}
        onClose={() => setEditingSection(null)}
      />
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={open}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{ '& .MuiDrawer-paper': { boxSizing: 'border-box', width } }}
      >
        {drawerContent}
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="persistent"
      open={open}
      sx={{
        width: open ? width : 0,
        flexShrink: 0,
        '& .MuiDrawer-paper': { width, boxSizing: 'border-box' },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
