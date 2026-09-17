/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_ENABLED?: string;
  readonly VITE_AUTH_TENANT_ID?: string;
  readonly VITE_AUTH_CLIENT_ID?: string;
  readonly VITE_AUTH_AUTHORITY_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
