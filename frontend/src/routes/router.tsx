// This module's only export is `router` (a RemixRouter config object, not a
// component), so Fast Refresh never treats it as a component boundary.
// eslint-plugin-react-refresh v0.5+ still flags the module-local `lazy()`
// components below even though none of them are exported - disable for the
// whole file rather than 11 individual line comments.
/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { useAuth } from '@/contexts/auth-context';
import { homePathFor } from './home-path';
import { ProtectedRoute } from './protected-route';
import { LoadingSpinner, ErrorBoundary } from '@/components/common';

// Lazy load pages for code splitting
const DashboardPage = lazy(() =>
  import('@/pages/dashboard-page').then((m) => ({ default: m.DashboardPage }))
);
const UsersPage = lazy(() =>
  import('@/pages/users-page').then((m) => ({ default: m.UsersPage }))
);
const TerminalsPage = lazy(() =>
  import('@/pages/terminals-page').then((m) => ({ default: m.TerminalsPage }))
);
const AuditPage = lazy(() =>
  import('@/pages/audit-page').then((m) => ({ default: m.AuditPage }))
);
const SettingsPage = lazy(() =>
  import('@/pages/settings-page').then((m) => ({ default: m.SettingsPage }))
);
const NotFoundPage = lazy(() =>
  import('@/pages/not-found-page').then((m) => ({ default: m.NotFoundPage }))
);
const ContractsPage = lazy(() =>
  import('@/pages/contracts-page').then((m) => ({ default: m.ContractsPage }))
);
const KitsPage = lazy(() =>
  import('@/pages/kits-page').then((m) => ({ default: m.KitsPage }))
);
const CatalogPage = lazy(() =>
  import('@/pages/catalog-page').then((m) => ({ default: m.CatalogPage }))
);
const PaceSectionPage = lazy(() =>
  import('@/pages/pace-section-page').then((m) => ({ default: m.PaceSectionPage }))
);
const NetsPage = lazy(() =>
  import('@/pages/nets-page').then((m) => ({ default: m.NetsPage }))
);
const NetsIndexPage = lazy(() =>
  import('@/pages/nets-index-page').then((m) => ({ default: m.NetsIndexPage }))
);
const NetsPrintPage = lazy(() =>
  import('@/pages/nets-print-page').then((m) => ({ default: m.NetsPrintPage }))
);
const PaceEditorPage = lazy(() =>
  import('@/pages/pace-editor-page').then((m) => ({ default: m.PaceEditorPage }))
);
const PaceIndexPage = lazy(() =>
  import('@/pages/pace-index-page').then((m) => ({ default: m.PaceIndexPage }))
);
const PacePrintPage = lazy(() =>
  import('@/pages/pace-print-page').then((m) => ({ default: m.PacePrintPage }))
);
const CatalogSheetPage = lazy(() =>
  import('@/pages/catalog-sheet-page').then((m) => ({ default: m.CatalogSheetPage }))
);
const CommsLibraryPage = lazy(() =>
  import('@/pages/comms-library-page').then((m) => ({ default: m.CommsLibraryPage }))
);
const CommsLibraryPrintPage = lazy(() =>
  import('@/pages/comms-library-print-page').then((m) => ({ default: m.CommsLibraryPrintPage }))
);
const CatalogCompatibilityPage = lazy(() =>
  import('@/pages/catalog-compatibility-page').then((m) => ({ default: m.CatalogCompatibilityPage }))
);
const CatalogCompatibilityPrintPage = lazy(() =>
  import('@/pages/catalog-compatibility-print-page').then((m) => ({ default: m.CatalogCompatibilityPrintPage }))
);
const CatalogEditorPage = lazy(() =>
  import('@/pages/catalog-editor-page').then((m) => ({ default: m.CatalogEditorPage }))
);
const CatalogComparePage = lazy(() =>
  import('@/pages/catalog-compare-page').then((m) => ({ default: m.CatalogComparePage }))
);
const CatalogComparePrintPage = lazy(() =>
  import('@/pages/catalog-compare-print-page').then((m) => ({ default: m.CatalogComparePrintPage }))
);
const CatalogPrintPage = lazy(() =>
  import('@/pages/catalog-print-page').then((m) => ({ default: m.CatalogPrintPage }))
);

// Suspense wrapper for lazy-loaded components
function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner fullScreen />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/**
 * The front door, which depends on the role: /terminals is hidden from a
 * planner, so sending one there was a redirect into a page with no nav entry.
 * A component rather than a static Navigate, because the destination needs
 * useAuth - AuthProvider sits above RouterProvider in App.tsx.
 */
function HomeRedirect() {
  const { role, isLoading } = useAuth();
  // Redirecting mid-load would send every planner to /terminals on a cold load,
  // since role is null until /users/me answers.
  if (isLoading) return null;
  return <Navigate to={homePathFor(role)} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomeRedirect />,
  },
  {
    path: '/dashboard',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <DashboardPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/terminals',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <TerminalsPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/kits',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <KitsPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/contracts',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <ContractsPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/catalog',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <CatalogPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/nets',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <NetsIndexPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/nets/:section',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <NetsPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/nets/:section/print',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <NetsPrintPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/pace',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <PaceIndexPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/pace/:section/edit',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <PaceEditorPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    // Must precede '/pace/:section', which would otherwise match 'print' as a
    // section key and render the section page for a squadron that does not exist.
    path: '/pace/:section/print',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <PacePrintPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/pace/:section',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <PaceSectionPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    // Before /catalog/compare, which would otherwise not match it at all, and
    // before /catalog/:id for the reason given on the next entry.
    path: '/catalog/compare/print',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <CatalogComparePrintPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    // Before /catalog/:id, for the same reason /catalog/editor is: below it,
    // "compare" matches as an :id and renders the sheet page for a record
    // that does not exist.
    path: '/catalog/compare',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <CatalogComparePage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/catalog/editor',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <CatalogEditorPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    // Before /catalog/:id, for the same reason /catalog/editor is: below it,
    // "comms-library" would match as an equipment id and render a data sheet
    // for a record that does not exist.
    path: '/catalog/comms-library',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <CommsLibraryPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    // Before /catalog/:id like its parent, and for the same reason.
    path: '/catalog/comms-library/print',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <CommsLibraryPrintPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    // Both before /catalog/:id, for the same reason as comms-library above:
    // below it, "compatibility" would match as an equipment id.
    path: '/catalog/compatibility/print',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <CatalogCompatibilityPrintPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/catalog/compatibility',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <CatalogCompatibilityPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/catalog/:id/edit',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <CatalogEditorPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/catalog/:id/print',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <CatalogPrintPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/catalog/:id',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <CatalogSheetPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/users',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <UsersPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/audit',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <AuditPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '/settings',
    element: (
      <SuspenseWrapper>
        <ProtectedRoute>
          <SettingsPage />
        </ProtectedRoute>
      </SuspenseWrapper>
    ),
  },
  {
    path: '*',
    element: (
      <SuspenseWrapper>
        <NotFoundPage />
      </SuspenseWrapper>
    ),
  },
]);
