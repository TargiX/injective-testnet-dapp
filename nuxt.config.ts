export default defineNuxtConfig({
  compatibilityDate: '2025-06-01',
  devtools: { enabled: false },

  modules: ['@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  experimental: { appManifest: false },

  vite: {
    server: {
      force: true,
    },
  },

  runtimeConfig: {
    public: {
      // 'mainnet' | 'testnet' — set NUXT_PUBLIC_NETWORK=testnet locally to
      // trade on the public testnet with faucet funds (chain injective-888).
      network: process.env.NUXT_PUBLIC_NETWORK || 'mainnet',
      demoAddress: 'inj1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc54tm65y',
    },
  },

  app: {
    head: {
      title: 'Injective Trading Terminal',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/icon-192.png' },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content:
            'Nuxt/TypeScript trading terminal on Injective (Cosmos): live order book, candlestick charts, spot trading via injective-ts gRPC-web SDK.',
        },
        { name: 'theme-color', content: '#0b0e13' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Injective' },
        { name: 'mobile-web-app-capable', content: 'yes' },
      ],
    },
  },

  hooks: {
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
