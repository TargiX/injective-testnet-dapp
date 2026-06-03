import { Buffer } from 'buffer'
import process from 'process/browser'

// Provide node globals the Injective SDK expects, in the browser only.
export default defineNuxtPlugin(() => {
  const g = globalThis as any
  if (!g.Buffer) g.Buffer = Buffer
  if (!g.global) g.global = globalThis
  if (!g.process) g.process = process
})
