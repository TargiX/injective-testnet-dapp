// SSR stays on, but the Injective SDK is large and node-oriented, so it is
// loaded lazily via dynamic import (see composables/useInjective.ts) and never
// enters the server render path. In the browser, Buffer/global/process are
// polyfilled for the CLIENT bundle only (see plugins/polyfills.client.ts and the
// client-scoped vite tweaks below). All chain/wallet calls run client-side.
export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',
  devtools: { enabled: false },

  // No payload/manifest needed for a client-driven SPA-style dashboard; turning
  // it off also avoids a benign "#app-manifest" cold-start warning in dev.
  experimental: { appManifest: false },

  runtimeConfig: {
    public: {
      // Read-only demo address shown by default so the app shows real on-chain
      // balances without anyone connecting a wallet. Override per-deploy with
      // the env var NUXT_PUBLIC_DEMO_ADDRESS. This is a public testnet address;
      // we only ever READ its balances — no keys involved.
      demoAddress: 'inj1zud3rrh3jlfrn4rlqszlxp6yq5vmlaz6ycgp8s',
    },
  },

  app: {
    head: {
      title: 'Injective Testnet dApp',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Small Nuxt/TypeScript dApp on the Injective (Cosmos) testnet: wallet connect, on-chain balance and a live spot order book via the injective-ts gRPC-web SDK.',
        },
      ],
    },
  },

  hooks: {
    // Browser-only tweaks for the CLIENT vite build. The server build keeps
    // real node `process`/`Buffer`. No path aliases for process/buffer — a
    // prefix alias on "process" recursively rewrites "process/browser" and
    // blows the heap. The globals are installed in plugins/polyfills.client.ts.
    'vite:extendConfig'(config, { isClient }) {
      if (!isClient) return
      config.define = { ...(config.define || {}), global: 'globalThis' }
      config.optimizeDeps = config.optimizeDeps || {}
      config.optimizeDeps.esbuildOptions = {
        ...(config.optimizeDeps.esbuildOptions || {}),
        define: { global: 'globalThis' },
      }
      config.optimizeDeps.include = [
        ...(config.optimizeDeps.include || []),
        'buffer',
        'process',
      ]
    },
  },
})
