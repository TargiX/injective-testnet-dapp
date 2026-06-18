<script setup lang="ts">
const { isTestnet } = useInjective()
const route = useRoute()
</script>

<template>
  <div class="min-h-dvh flex flex-col bg-surface text-[var(--ui-text)]">
    <header class="flex-none flex items-center justify-between gap-4 px-4 lg:px-5 py-3 border-b border-border-soft">
      <div class="flex items-center gap-3">
        <NuxtLink to="/" class="w-9 h-9 grid place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-dim text-surface font-extrabold text-base hover:opacity-90 transition-opacity">
          ▚
        </NuxtLink>
        <!-- Terminal / Portfolio nav -->
        <div class="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
          <NuxtLink
            to="/"
            class="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded transition-colors"
            :class="route.path === '/' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
          >
            Terminal
          </NuxtLink>
          <NuxtLink
            to="/portfolio"
            class="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded transition-colors"
            :class="route.path === '/portfolio' ? 'bg-surface-3 text-[var(--ui-text)]' : 'text-[var(--ui-text-dimmed)] hover:text-[var(--ui-text-muted)]'"
          >
            Portfolio
          </NuxtLink>
        </div>
        <div class="hidden sm:block">
          <h1 class="text-sm font-bold tracking-tight leading-tight">Injective Trading</h1>
          <p class="hidden lg:block text-[11px] text-[var(--ui-text-muted)] leading-tight">
            Wallet · balances · live order book ·
            <code class="font-mono">injective-ts</code> gRPC-web
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <UBadge variant="subtle" :color="isTestnet ? 'warning' : 'success'" size="sm">
          <span
            class="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
            :class="isTestnet ? 'bg-yellow-400' : 'bg-bid shadow-glow-bid'"
          />
          {{ isTestnet ? 'injective-888 · testnet' : 'injective-1 · mainnet' }}
        </UBadge>
        <ConnectionIndicator class="hidden sm:flex" />
        <WalletConnect />
      </div>
    </header>

    <slot />

    <footer class="flex-none flex items-center justify-between px-4 lg:px-5 py-1.5 border-t border-border-soft text-[11px]">
      <div class="flex items-center gap-1">
        <span class="text-[var(--ui-text-dimmed)]">{{ isTestnet ? 'injective-888 · testnet' : 'injective-1 · mainnet' }}</span>
      </div>
      <ConnectionIndicator />
    </footer>
  </div>
</template>
