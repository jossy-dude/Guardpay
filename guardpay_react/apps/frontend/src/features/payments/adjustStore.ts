'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AdjustKind = 'overpaid' | 'underpaid'

export interface AdjustAnnotation {
  kind: AdjustKind
  amount: number
}

type Key = string

interface AdjustState {
  annotations: Record<Key, AdjustAnnotation>
  set: (houseId: number, monthKey: string, kind: AdjustKind, amount: number) => void
  clear: (houseId: number, monthKey: string) => void
}

const keyFor = (houseId: number, monthKey: string) => `${houseId}:${monthKey}`

/**
 * UI-only overpaid/underpaid reminders. No calculations, no DB — just a quick
 * "who owed / who over-paid" tag that carries into the next month's view.
 * Persisted to localStorage so the tags survive reloads.
 */
export const useAdjustStore = create<AdjustState>()(
  persist(
    (set) => ({
      annotations: {},
      set: (houseId, monthKey, kind, amount) =>
        set((s) => ({ annotations: { ...s.annotations, [keyFor(houseId, monthKey)]: { kind, amount } } })),
      clear: (houseId, monthKey) =>
        set((s) => {
          const next = { ...s.annotations }
          delete next[keyFor(houseId, monthKey)]
          return { annotations: next }
        }),
    }),
    {
      name: 'payment-adjust-annotations',
      version: 1,
      migrate: (persisted, version) => {
        if (version >= 1) return persisted as AdjustState
        const state = persisted as Partial<AdjustState> | undefined
        const annotations: Record<string, AdjustAnnotation> = {}
        for (const [key, raw] of Object.entries(state?.annotations ?? {})) {
          const a = raw as Partial<AdjustAnnotation> | undefined
          if (!a || !a.kind) continue
          annotations[key] = { kind: a.kind, amount: typeof a.amount === 'number' ? a.amount : 0 }
        }
        return { annotations }
      },
    },
  ),
)

export const adjustFor = (annotations: Record<string, AdjustAnnotation>, houseId: number, monthKey: string) =>
  annotations[keyFor(houseId, monthKey)]

/** Friendly label shown under a row: carries into the next month. */
export function adjustHint(a: AdjustAnnotation | undefined): string | null {
  if (!a) return null
  const signed = a.kind === 'overpaid' ? `+${a.amount.toLocaleString()}` : `-${a.amount.toLocaleString()}`
  return a.kind === 'overpaid'
    ? `Next month: overpaid · ${signed}`
    : `Next month: debt · ${signed}`
}
