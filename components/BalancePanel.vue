<script setup lang="ts">
import { toHumanAmount, fmt, shortAddress, denomKind, cleanName } from '~/utils/inj-format'

const {
  isDemo,
  viewAddress,
  balances,
  balancesLoading,
  loadBalances,
} = useInjective()

const visible = computed(() =>
  [...balances.value]
    .filter((b) => b.decimals > 0)
    .map((b) => ({ ...b, human: toHumanAmount(b.amount, b.decimals) }))
    .filter((b) => b.human > 0)
    .sort((a, b) => b.human - a.human),
)
</script>

<template>
  <div class="h-full flex flex-col rounded-lg overflow-hidden bg-[var(--ui-bg)] ring ring-[var(--ui-border)]">
    <div class="flex-none flex items-center justify-between px-4 py-2 border-b border-border-soft">
      <span class="text-xs font-bold uppercase tracking-wider text-[var(--ui-text-muted)]">Wallet</span>
      <div class="flex items-center gap-2">
        <UBadge v-if="isDemo" variant="subtle" color="warning" size="sm">read-only</UBadge>
        <a
          class="font-mono tabular-nums text-[11px] text-[var(--ui-text-dimmed)] hover:text-accent transition-colors"
          :href="'https://explorer.injective.network/account/' + viewAddress"
          target="_blank"
          rel="noopener"
          :title="viewAddress"
        >
          {{ shortAddress(viewAddress) }}
        </a>
        <UButton
          variant="ghost"
          size="xs"
          :loading="balancesLoading"
          icon="i-lucide-rotate-ccw"
          @click="loadBalances"
        />
      </div>
    </div>

    <div v-if="balancesLoading && !balances.length" class="flex-1 flex items-center justify-center text-sm text-[var(--ui-text-muted)]">
      Loading…
    </div>

    <div v-else-if="!visible.length" class="flex-1 flex flex-col items-center justify-center p-4 gap-1">
      <p class="text-sm text-[var(--ui-text-muted)]">No non-zero balances.</p>
      <p class="text-[11px] text-[var(--ui-text-dimmed)]">
        Get INJ from an
        <a href="https://hub.injective.network/bridge" target="_blank" rel="noopener" class="text-accent hover:underline">exchange or bridge</a>.
      </p>
    </div>

    <template v-else>
      <div class="flex-none grid grid-cols-[1fr_1fr_auto] px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--ui-text-dimmed)] border-b border-border-soft">
        <span>Asset</span>
        <span class="text-right">Amount</span>
        <span class="text-right w-14">Type</span>
      </div>
      <div class="flex-1 overflow-y-auto min-h-0">
        <div
          v-for="b in visible"
          :key="b.denom"
          class="grid grid-cols-[1fr_1fr_auto] items-center px-3 py-1.5 border-b border-border-soft last:border-b-0"
        >
          <div class="flex items-center gap-2 min-w-0">
            <TokenIcon :logo="b.logo" :symbol="b.symbol" :size="18" />
            <span class="font-semibold text-[12px] truncate">{{ b.symbol }}</span>
          </div>
          <span class="text-right font-mono tabular-nums text-[12px] max-lg:text-[11px] truncate">{{ fmt(b.human, 4) }}</span>
          <span class="text-right w-14">
            <span class="text-[9px] font-semibold uppercase tracking-wider text-[var(--ui-text-dimmed)] bg-surface-2 rounded-full px-1.5 py-0.5">
              {{ denomKind(b.denom) }}
            </span>
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
