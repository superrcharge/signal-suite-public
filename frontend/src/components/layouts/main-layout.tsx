import { ReactNode, useState } from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { SIDEBAR_WIDTH, HEADER_HEIGHT, CONTENT_GUTTER } from './layout-constants';

interface MainLayoutProps {
  children: ReactNode;
}

// Re-exported so every page keeps importing them from here, which is where
// they have always come from. They are defined in a leaf module because the
// sidebar needs HEADER_HEIGHT and this file imports the sidebar - see
// `layout-constants.ts`.
export { HEADER_HEIGHT, CONTENT_GUTTER } from './layout-constants';

/**
 * Main application layout with header and sidebar
 */
export function MainLayout({ children }: MainLayoutProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Skip link for accessibility */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Header */}
      <Header
        onMenuClick={toggleSidebar}
        sidebarOpen={sidebarOpen}
        sidebarWidth={SIDEBAR_WIDTH}
      />

      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        width={SIDEBAR_WIDTH}
        isMobile={isMobile}
      />

      {/* Main content */}
      <Box
        component="main"
        id="main-content"
        sx={{
          flexGrow: 1,
          mt: `${HEADER_HEIGHT}px`,
          height: `calc(100vh - ${HEADER_HEIGHT}px)`,
          overflow: 'auto',
          backgroundColor: 'background.default',
        }}
      >
        {/* No min-height here on purpose. A page surface that wants to fill
            the window (the browse panel, the Comms Library, the matrix) sizes
            itself from `100vh` minus the chrome above it: a percentage
            min-height on a child of this auto-height box resolves to nothing,
            which is how the Comms Library's graphite once stopped where its
            rows did with the page colour showing beneath. */}
        <Box sx={{ p: CONTENT_GUTTER }}>{children}</Box>
      </Box>
    </Box>
  );
}
