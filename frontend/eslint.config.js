import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  {
    // 'coverage' is here because `npm run test:coverage` writes a tree of
    // generated .js into frontend/coverage/, and ESLint flat config ignores only
    // node_modules and .git by default. Without this, running the coverage
    // script and then `npm run lint` lints the coverage report itself under
    // js.configs.recommended with --max-warnings 0, which fails the build on
    // output nobody wrote.
    ignores: [
      'dist',
      'coverage',
      'eslint.config.js',
      '*.config.ts',
      '*.config.d.ts',
      '*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2020 },
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-refresh': reactRefresh,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs['recommended-requiring-type-checking'].rules,
      // TypeScript's own checker is authoritative for undefined identifiers
      // and correctly allows UMD-global type positions (e.g. `React.ReactNode`
      // without a value import of React). Core no-undef doesn't know about
      // that and false-positives on every such usage - the documented
      // typescript-eslint guidance is to turn it off for TS/TSX files.
      'no-undef': 'off',
      // eslint-plugin-react-hooks v7's `recommended` config folds in the
      // full React Compiler rule suite (static-components, purity,
      // set-state-in-effect, etc). This app doesn't use React Compiler,
      // so only the two rules this project has always run are enabled here
      // rather than adopt that suite as a side effect of a version bump.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // Enforced going forward so codemods/tools can't silently introduce
      // double-quoted strings again (the MUI v9 sx-prop codemod did, across
      // ~20 files) without lint catching it. (@typescript-eslint dropped its
      // own `quotes` rule as unnecessary -- core ESLint's isn't type-aware
      // and doesn't need to be for this.)
      quotes: ['error', 'single', { avoidEscape: true }],
    },
  },
];
