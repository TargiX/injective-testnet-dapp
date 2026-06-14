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
      demoAddress: 'inj1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc54tm65y',
    },
  },

  app: {
    head: {
      title: 'Injective Trading Terminal',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Nuxt/TypeScript trading terminal on Injective (Cosmos): live order book, candlestick charts, spot trading via injective-ts gRPC-web SDK.',
        },
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
