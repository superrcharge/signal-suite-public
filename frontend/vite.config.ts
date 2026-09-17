import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0', // Allow connections from Docker network
    allowedHosts: ['frontend', 'localhost', 'app'], // Allow Docker service hostnames
    hmr: {
      // HMR WebSocket connects directly to Vite, bypassing OAuth2-Proxy and backend
      host: 'localhost',
      clientPort: 5173,
    },
    watch: {
      usePolling: true, // Required for Docker volume mounts
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // No manual `codeSplitting.groups`, and that is deliberate.
    //
    // Three groups used to force react, @mui and @tanstack into named chunks.
    // That grouping decides where the LIBRARY code goes and says nothing about
    // where rolldown puts its own runtime helpers, and the two can disagree: on
    // In an earlier release the graph shifted enough that the runtime stopped being emitted as
    // its own chunk and was folded into the auto-generated `auth-service` chunk
    // instead. `vendor` then imported a helper from `auth-service` and called it
    // at module scope, while `auth-service` depended on `vendor` in turn, so the
    // helper was still undefined when React's top-level code ran:
    //
    //   TypeError: e is not a function   at vendor-*.js:1:61
    //
    // The whole SPA was a blank white screen. Nothing caught it: the build
    // succeeded, all 15 verify steps passed, all six CI jobs passed, and the
    // deploy smoke test passed too, because it checks that `/` returns HTML and
    // cannot check that the HTML's JavaScript runs. See check-bundle.mjs, which
    // now closes that gap.
    //
    // Adding a fourth group for msal did not help - the runtime chunk still went
    // missing - so this is not a grouping to tune. Left to rolldown, a dedicated
    // `rolldown-runtime-*.js` chunk is emitted and every chunk imports from it,
    // which is acyclic by construction.
  },
});
