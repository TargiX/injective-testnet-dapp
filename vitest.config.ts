import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Plain vitest config (no Nuxt environment). We resolve the `~`/`~~` aliases
// to the project root so imports like `~/utils/inj-format` work, and stub the
// Nuxt auto-import composables (`useInjective`, `usePortfolio`) in tests.
// Components are tested with @vue/test-utils + happy-dom; they don't need the
// full Nuxt runtime, which keeps the suite fast and decoupled from the
// vite-plugin-node-polyfills gRPC plumbing.
export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./', import.meta.url)),
      '~~': fileURLToPath(new URL('./', import.meta.url)),
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.{test,spec}.ts'],
    setupFiles: ['tests/setup.ts'],
  },
})
