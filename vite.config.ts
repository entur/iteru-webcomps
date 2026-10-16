/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

/**
 * Vite config.
 *
 * For the **library build** (`npm run build`) it runs in "library mode": emits
 * the public entry (`src/index.ts`) as ES modules (`.js`) and CommonJS (`.cjs`),
 * plus `.d.ts` declarations (`vite-plugin-dts`). React, MUI, and Emotion are
 * externalised (peer deps) so the host supplies a single shared copy.
 *
 * Storybook (`@storybook/react-vite`) auto-loads this same file, so the
 * library-only bits — lib mode, `external`, and the `dts` plugin — are gated to
 * the `build` script via `npm_lifecycle_event`. Leaking them into the Storybook
 * build breaks it: `dts` can't resolve `dist/index.d.ts`, and externalising
 * React would leave the static Storybook bundle with unresolved bare imports.
 */
const EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  '@mui/material',
  '@mui/icons-material',
  '@mui/x-data-grid',
  '@emotion/react',
  '@emotion/styled',
  // The GraphQL transport. `graphql` itself is never imported by this library —
  // it is only reachable through graphql-request, so externalising the client
  // keeps the whole graphql runtime out of `dist` as well.
  'graphql-request',
  'graphql',
];

// True only under `npm run build` — not `storybook` / `build-storybook` / `test`.
const isLibBuild = process.env.npm_lifecycle_event === 'build';

export default defineConfig({
  plugins: [
    react(),
    ...(isLibBuild ? [dts({ bundleTypes: true, tsconfigPath: './tsconfig.json' })] : []),
  ],
  build: isLibBuild
    ? {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          formats: ['es', 'cjs'],
          fileName: fmt => (fmt === 'es' ? 'index.js' : 'index.cjs'),
        },
        rollupOptions: {
          external: id => EXTERNAL.some(p => id === p || id.startsWith(`${p}/`)),
        },
        sourcemap: true,
      }
    : undefined,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
