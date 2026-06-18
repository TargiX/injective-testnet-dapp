import { describe, it, expect } from 'vitest'
import { ref, computed } from 'vue'

describe('test harness sanity', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })

  it('exposes vue reactivity globals', () => {
    const r = ref(5)
    const doubled = computed(() => r.value * 2)
    expect(doubled.value).toBe(10)
    r.value = 3
    expect(doubled.value).toBe(6)
  })

  it('exposes useState auto-import that shares state across calls', () => {
    // useState is set up in tests/setup.ts on globalThis
    const a = (globalThis as any).useState('test-key', () => 42)
    expect(a.value).toBe(42)
    a.value = 99
    const b = (globalThis as any).useState('test-key', () => 0)
    expect(b.value).toBe(99)
  })
})
