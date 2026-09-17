import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',

    // The default 'forks' pool intermittently loses a worker on teardown under
    // jsdom on Windows: every test passes, then the run exits non-zero with
    // 'Worker exited unexpectedly'. worker_threads does not exhibit it.
    pool: 'threads',

    // 15s rather than the 5s default, and the reason is worth recording because
    // raising a timeout usually hides a bug.
    //
    // Nothing here is waiting on I/O. These are jsdom renders of MUI trees -
    // the PACE channel editor mounts 16 rows of Selects, the drawers mount a
    // dozen fields plus a dialog - and a single synchronous render measures 1
    // to 5 seconds on this machine. Run one file at a time every suite passes;
    // run all 49 in parallel and whichever file happens to lose the CPU race
    // crosses 5s and reports a timeout. Two different files failed that way on
    // consecutive runs of the same unchanged code, which is the signature of a
    // threshold measuring machine load rather than correctness.
    //
    // A timeout exists to catch async work that never settles. There is none in
    // these suites to catch, so 5s was buying no safety and costing a red gate
    // at random. If a test ever does hang, 15s still ends the run promptly.
    testTimeout: 15_000,

    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.test.tsx',
        '**/*.test.ts',
        '**/*.config.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
    },
  },
});
