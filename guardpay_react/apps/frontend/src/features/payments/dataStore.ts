'use client'

import { create } from 'zustand'
import type {
  Alias,
  ApiSettings,
  ApiStateResponse,
  FeeChange,
  GuardPayment,
  Household,
  HouseStats,
  Payment,
  Reminder,
  Settings,
} from '@/lib/types'
import { computeAllHouseStats } from '@/features/scoring/scoring'

interface DataState {
  houses: Household[]
  payments: Payment[]
  settings: Settings
  guardPayments: GuardPayment[]
  reminders: Reminder[]
  aliases: Alias[]
  feeChanges: FeeChange[]
  /** Derived once per state payload — memoized so consumers never recompute. */
  allStats: Map<number, HouseStats>
  loaded: boolean
  setState: (d: ApiStateResponse) => void
  setHouses: (h: Household[]) => void
  setSettings: (s: Settings) => void
  upsertHouse: (h: Household) => void
  removeHouse: (id: number) => void
  upsertPayment: (p: Payment) => void
  removePayment: (houseId: number, monthKey: string) => void
}

const emptySettings: Settings = {
  neighborhoodName: 'Neighborhood Watch',
  currency: 'ETB',
  dueDay: 5,
  guardName: 'Night Watch Guard',
  guardSalary: 30000,
  backupBeforeChanges: false,
  defaultFee: 4000,
  guardAccountSuffix: '',
  calendarMode: 'gregorian',
  monthLanguage: 'english',
  heatmapShape: 'square',
}

function mapSettings(a: ApiSettings): Settings {
  return {
    neighborhoodName: a.neighborhood_name,
    currency: a.currency,
    dueDay: a.due_day,
    guardName: a.guard_name,
    guardSalary: a.guard_salary,
    backupBeforeChanges: a.backup_before_changes,
    defaultFee: a.default_fee,
    guardAccountSuffix: a.guard_account_suffix,
    calendarMode: a.calendar_mode ?? 'gregorian',
    monthLanguage: a.month_language ?? 'english',
    heatmapShape: a.heatmap_shape ?? 'square',
  }
}

export const useDataStore = create<DataState>()((set) => ({
  houses: [],
  payments: [],
  settings: emptySettings,
  guardPayments: [],
  reminders: [],
  aliases: [],
  feeChanges: [],
  allStats: new Map(),
  loaded: false,
  setState: (d) =>
    set(() => {
      const houses: Household[] = d.houses.map((h) => ({
        id: h.id,
        name: h.name,
        houseNumber: h.house_number,
        fee: h.fee,
        notes: h.notes,
        active: h.active,
        createdMonth: h.created_month,
        createdAt: h.created_at,
        updatedAt: h.updated_at,
        deletedAt: h.deleted_at,
        avatar: h.avatar ?? null,
        openingBalance: h.opening_balance ?? 0,
      }))
      const byId = new Map(houses.map((h) => [h.id, h]))
      const payments: Payment[] = d.payments.map((p) => ({
        id: p.id,
        houseId: p.house_id,
        monthKey: p.month_key,
        paidDate: p.paid_date,
        amount: p.amount,
        note: p.note,
        source: p.source ?? 'manual',
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }))
      const reminders: Reminder[] = d.reminders.map((r) => {
        const house = byId.get(r.house_id)
        return {
          id: r.id,
          houseId: r.house_id,
          houseName: house?.name ?? '',
          houseNumber: house?.houseNumber ?? '',
          isActive: r.is_active,
          note: r.note,
          createdAt: r.created_at,
          remindedAt: r.reminded_at,
        }
      })
      const settings = mapSettings(d.settings)
      return {
        houses,
        payments,
        settings,
        guardPayments: d.guard_payments.map((g) => ({
          id: g.id,
          monthKey: g.month_key,
          paidDate: g.paid_date,
          amount: g.amount,
          method: g.method as GuardPayment['method'],
          note: g.note,
          createdAt: g.created_at,
          updatedAt: g.updated_at,
        })),
        reminders,
        aliases: d.aliases.map((a) => ({
          id: a.id,
          houseId: a.house_id,
          alias: a.alias,
          createdAt: a.created_at,
        })),
        feeChanges: d.fee_changes.map((f) => ({
          id: f.id,
          houseId: f.house_id,
          oldFee: f.old_fee,
          newFee: f.new_fee,
          changedAt: f.changed_at,
          note: f.note,
        })),
        allStats: computeAllHouseStats(houses, payments, settings),
        loaded: true,
      }
    }),
  setHouses: (h) => set((s) => ({ houses: h, allStats: computeAllHouseStats(h, s.payments, s.settings) })),
  setSettings: (s2) => set((s) => ({ settings: s2, allStats: computeAllHouseStats(s.houses, s.payments, s2) })),
  upsertHouse: (h) =>
    set((s) => {
      const i = s.houses.findIndex((x) => x.id === h.id)
      const houses = i === -1 ? [...s.houses, h] : s.houses.map((x) => (x.id === h.id ? h : x))
      return { houses, allStats: computeAllHouseStats(houses, s.payments, s.settings) }
    }),
  removeHouse: (id) =>
    set((s) => {
      const houses = s.houses.filter((h) => h.id !== id)
      return { houses, allStats: computeAllHouseStats(houses, s.payments, s.settings) }
    }),
  upsertPayment: (p) =>
    set((s) => {
      const i = s.payments.findIndex(
        (x) => x.houseId === p.houseId && x.monthKey === p.monthKey,
      )
      const payments = [...s.payments]
      if (i === -1) payments.push(p)
      else payments[i] = p
      return { payments, allStats: computeAllHouseStats(s.houses, payments, s.settings) }
    }),
  removePayment: (houseId, monthKey) =>
    set((s) => {
      const payments = s.payments.filter((p) => !(p.houseId === houseId && p.monthKey === monthKey))
      return { payments, allStats: computeAllHouseStats(s.houses, payments, s.settings) }
    }),
}))

/** Memoized registry of every household's computed stats. Derived once per
 *  state change — shared by Dashboard, Records, Data, Analytics and the
 *  mascot so none of them re-run `computeAllHouseStats` per render. */
export function useAllHouseStats(): Map<number, HouseStats> {
  return useDataStore((s) => s.allStats)
}
