import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // The domain suite is pure TypeScript — no DOM, no emulator, no network.
    // It runs identically for both apps because both consume @sfsr/domain.
    // See Development Plan.md §11.1.
    environment: 'node',
    globals: true,
    include: ['packages/**/src/**/*.test.ts', 'apps/**/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
  },
  resolve: {
    alias: {
      '@sfsr/domain': path.resolve(import.meta.dirname, './packages/domain/src'),
      '@sfsr/infrastructure': path.resolve(import.meta.dirname, './packages/infrastructure/src'),
      '@sfsr/ui': path.resolve(import.meta.dirname, './packages/ui/src'),
      /*
       * `server-only` throws on import outside a React Server Component. That
       * guard is there to turn an accidental client import into a build error
       * in the apps; a vitest process is neither, so importing anything from
       * `@sfsr/infrastructure/server` — even a pure helper sitting beside it —
       * failed before the test ran. Stubbed to an empty module.
       */
      'server-only': path.resolve(import.meta.dirname, './packages/infrastructure/src/testing/server-only-stub.ts'),
    },
  },
});
