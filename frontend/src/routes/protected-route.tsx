import { useAuth } from '@/contexts';
import { LoadingSpinner } from '@/components/common';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Route wrapper that displays user content. main.tsx's bootstrap
 * already gates the entire SPA on MSAL having an active account when
 * AUTH_ENABLED=true (no account → loginRedirect before render), so by
 * the time this component runs the user is authenticated. We only show
 * a loading state while /users/me resolves; the API still enforces
 * auth server-side regardless of this client-side gate.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner fullScreen message="Loading..." />;
  }

  return <>{children}</>;
}
