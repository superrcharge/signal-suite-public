import {
  Configuration,
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser';

/**
 * The runtime auth configuration. In production the backend templates
 * `window.__SHF_AUTH__` into the served index.html (see
 * backend/internal/middleware/frontend.go). In dev (Vite proxy) the
 * fallback reads from VITE_AUTH_* env vars set in `frontend/.env.local`
 * - and in dev with auth disabled, neither source is required.
 */
export interface ShfAuthConfig {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  authorityHost: string;
}

declare global {
  interface Window {
    __SHF_AUTH__?: ShfAuthConfig;
  }
}

const fallback: ShfAuthConfig = {
  enabled: import.meta.env.VITE_AUTH_ENABLED === 'true',
  tenantId: import.meta.env.VITE_AUTH_TENANT_ID ?? '',
  clientId: import.meta.env.VITE_AUTH_CLIENT_ID ?? '',
  authorityHost: import.meta.env.VITE_AUTH_AUTHORITY_HOST ?? 'login.microsoftonline.com',
};

export const authConfig: ShfAuthConfig = window.__SHF_AUTH__ ?? fallback;

// Placeholder GUID used when auth is disabled - MSAL's constructor
// requires a non-empty client ID, but no MSAL methods are called in
// that mode so the placeholder never reaches the network.
const PLACEHOLDER_CLIENT_ID = '00000000-0000-0000-0000-000000000000';

const effectiveClientId = authConfig.clientId || PLACEHOLDER_CLIENT_ID;
const effectiveAuthority = authConfig.tenantId
  ? `https://${authConfig.authorityHost}/${authConfig.tenantId}/v2.0`
  : `https://${authConfig.authorityHost}/common/v2.0`;

// knownAuthorities pins MSAL to the configured cloud. Without it, MSAL's
// instance discovery (which always hits login.microsoftonline.com - even
// for sovereign clouds) can reroute auth requests to the wrong cloud,
// making US Gov / China cloud auth silently fail. The authorityHost is
// added to the trusted list so MSAL skips discovery and uses the URL
// we built directly.
const knownAuthorities = authConfig.authorityHost
  ? [authConfig.authorityHost]
  : undefined;

export const msalConfig: Configuration = {
  auth: {
    clientId: effectiveClientId,
    authority: effectiveAuthority,
    knownAuthorities,
    redirectUri: window.location.origin + '/',
    postLogoutRedirectUri: window.location.origin + '/',
  },
  cache: {
    cacheLocation: 'localStorage',
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

/**
 * Audience the backend verifies against. SPA requests this scope when
 * acquiring access tokens for the API. Only meaningful when
 * authConfig.enabled is true.
 */
export const apiScope = `api://${effectiveClientId}/access_as_user`;

/**
 * Returns the active MSAL account, falling back to the first cached
 * account, or null when none exist.
 */
export function getActiveAccount(): AccountInfo | null {
  return msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null;
}
