/**
 * Global test setup. Stubs the Nuxt auto-imports that composables rely on
 * (`useState`, `useRuntimeConfig`) so they can run outside a Nuxt app.
 * Vue's reactivity APIs (`ref`, `computed`, `watch`) come from globals:true,
 * but we import them explicitly to be safe across vitest environments.
 */
import { vi } from 'vitest'
import { ref, computed, watch, reactive, nextTick, unref } from 'vue'

// In-memory store backing the `useState` mock — keyed by the key string so
// multiple composable calls share the SAME ref (matching Nuxt semantics: the
// second useState('k') returns the identical reactive ref the first created).
const refStore = new Map<string, ReturnType<typeof ref>>()

function useState<T>(key: string, init: () => T) {
  if (!refStore.has(key)) refStore.set(key, ref(init()))
  return refStore.get(key) as ReturnType<typeof ref<T>>
}

// Minimal runtime config matching nuxt.config.ts public values.
function useRuntimeConfig() {
  return {
    public: {
      network: (process.env.NUXT_PUBLIC_NETWORK as 'mainnet' | 'testnet') || 'mainnet',
      demoAddress: 'inj1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc54tm65y',
    },
  }
}

// Expose the Nuxt auto-imports + Vue globals on globalThis so composables
// resolve them without explicit imports (mirrors Nuxt's auto-import).
Object.assign(globalThis, {
  useState,
  useRuntimeConfig,
  ref,
  computed,
  watch,
  reactive,
  nextTick,
  unref,
})

// Reset shared state between tests so each test starts clean.
beforeEach(() => {
  refStore.clear()
})

export {}
