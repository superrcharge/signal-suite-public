import { Box, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { MainLayout } from '@/components/layouts/main-layout';
import { visibleNavItems } from '@/components/layouts/nav-items';
import { PageBanner, PageTitle, PageSubtitle, RAIL_TITLE_ML, PANEL_SX, SURFACE_RADIUS, TILE_GRID_SX } from '@/components/common';
import { useAuth } from '@/contexts/auth-context';

/**
 * The app's home page: one tile per page the viewer can open, each with the
 * header menu's icon and the page title beneath it. The tiles come from the
 * same list and the same role filter as the header page menu, so the two
 * cannot disagree about what a viewer is offered.
 */
export function DashboardPage() {
  const { isAdmin, canSeeContracts, canSeeTrackers, isPlanner } = useAuth();
  const tiles = visibleNavItems({ isAdmin, canSeeContracts, canSeeTrackers, isPlanner }).filter((n) => n.path !== '/dashboard');

  return (
    <MainLayout>
      <PageBanner sx={{ mb: 3 }}>
        <PageTitle sx={{ minWidth: 0, ml: RAIL_TITLE_ML }}>
          Dashboard
          <PageSubtitle>Every page is also in the side panel and the menu at the top left. Click "Signal Suite" at the top right to come back here.</PageSubtitle>
        </PageTitle>
      </PageBanner>

      <Box component="nav" aria-label="Pages" sx={TILE_GRID_SX}>
        {tiles.map((item) => (
          <Box
            key={item.path}
            component={RouterLink}
            to={item.path}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              color: 'text.primary',
              textDecoration: 'none',
              borderRadius: SURFACE_RADIUS,
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              '&:hover .dash-tile': { borderColor: 'primary.main', color: 'primary.main' },
            }}
          >
            <Box
              className="dash-tile"
              sx={{
                ...PANEL_SX,
                width: '100%',
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.light',
                fontSize: 72,
                transition: 'border-color .12s, color .12s',
              }}
            >
              <item.Icon fontSize="inherit" />
            </Box>
            <Typography variant="body1" sx={{ fontWeight: 700, fontSize: '1.25rem', textAlign: 'center' }}>
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </MainLayout>
  );
}
