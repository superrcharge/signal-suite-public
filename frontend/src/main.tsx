import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { authConfig, apiScope, msalInstance, getActiveAccount } from './auth/msal-config';

async function bootstrap() {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  // initialize() is required since msal-browser v3 - sets up the
  // internal browser caches before any other API call.
  await msalInstance.initialize();

  // Handle the redirect response if we just returned from a login flow.
  // Returns null when there's no pending redirect. If MSAL throws (e.g.
  // corrupted/stale internal cache after long idle), clear the cache and
  // reload to recover automatically instead of failing the bootstrap.
  try {
    const redirectResponse = await msalInstance.handleRedirectPromise();
    const incomingAccount = redirectResponse?.account ?? getActiveAccount();
    if (incomingAccount) {
      msalInstance.setActiveAccount(incomingAccount);
    }
  } catch (err) {
    console.warn('MSAL redirect handling failed; clearing cache and retrying', err);
    await msalInstance.clearCache();
    window.location.reload();
    return;
  }

  if (authConfig.enabled && !msalInstance.getActiveAccount()) {
    // No cached account - bounce through Entra login. The redirect
    // navigates away; this load never reaches the render below.
    await msalInstance.loginRedirect({ scopes: [apiScope] });
    return;
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
