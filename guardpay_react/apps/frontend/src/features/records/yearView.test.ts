import { describe, expect, it } from 'vitest'
import { buildYearColumns, resolveYearCell, toggleCellKey, yearColumnTotals } from './yearView'
import type { Household, Payment, HouseStats } from '@/lib/types'

const house = (over: Partial<Household> = {}): Household => ({
  id: 1, name: 'H1', houseNumber: '12', fee: 4000, notes: '', active: true,
  createdMonth: '2025-09', avatar: null, openingBalance: 0, ...over,
} as Household)

const pay = (over: Partial<Payment>): Payment => ({
  id: 9, houseId: 1, monthKey: '2025-09', paidDate: '2025-09-03', amount: 4000,
  note: '', source: 'manual', createdAt: '', updatedAt: '', ...over,
} as Payment)

const statsWith = (monthKeys: string[]): HouseStats =>
  ({
    history: monthKeys.map((k) => ({
      monthKey: k,
      status: 'ontime',
      daysDiff: 0,
      paidDate: null,
      amount: null,
    })),
    resolved: [],
    currentStreak: 0,
    longestStreak: 0,
    onTimeRate: 100,
    reliabilityScore: 100,
    tier: 'excellent',
    paidMonths: monthKeys.length,
    totalMonths: monthKeys.length,
  }) as unknown as HouseStats

describe('buildYearColumns', () => {
  it('zips Amharic names with EC-ordered keys', () => {
    const cols = buildYearColumns(2018)
    expect(cols[0]).toMatchObject({ monthIndex: 1, amharic: 'መስከረም', monthKey: '2025-09' })
    expect(cols[12]).toMatchObject({ monthIndex: 13, amharic: 'ጳጉሜ', monthKey: '2026-09' })
  })
})

describe('resolveYearCell', () => {
  const nowKey = '2026-08'
  it('paid when payment has a paidDate', () => {
    const r = resolveYearCell(house(), undefined, '2025-09', nowKey, pay({}))
    expect(r.kind).toBe('paid')
  })
  it('due for existing unpaid month <= now', () => {
    const r = resolveYearCell(house(), statsWith(['2026-08']), '2026-08', nowKey, undefined)
    expect(r.kind).toBe('due')
  })
  it('future beyond current month even if house exists', () => {
    const r = resolveYearCell(house(), undefined, '2026-09', nowKey, undefined)
    expect(r.kind).toBe('future')
  })
  it('preborn before house.createdMonth', () => {
    const r = resolveYearCell(house(), undefined, '2026-09', '2027-01', undefined)
    expect(r.kind).toBe('preborn') // history has no entry for unbuilt span
  })
})

describe('yearColumnTotals', () => {
  it('sums collected per month and expected over living houses', () => {
    const cols = buildYearColumns(2018)
    const h1 = house()
    const h2 = house({ id: 2, fee: 3000 })
    const h3 = house({ id: 3, fee: 2000, createdMonth: '2026-01' }) // born after Meskerem
    const rows = [h1, h2, h3]
    const byHM = new Map<string, Payment>([
      [`1:${cols[0]!.monthKey}`, pay({ amount: 4000 })],
      [`2:${cols[0]!.monthKey}`, pay({ houseId: 2, amount: 3000 })],
    ])
    const stats = new Map<number, HouseStats | undefined>([
      [1, statsWith(['2025-09'])],
      [2, statsWith(['2025-09'])],
    ])
    const t = yearColumnTotals(rows, stats, cols, byHM)
    expect(t.collected.get(cols[0]!.monthKey)).toBe(7000)
    expect(t.expected.get(cols[0]!.monthKey)).toBe(7000) // both living houses counted; h3 excluded (no history entry)
  })
})

describe('toggleCellKey', () => {
  it('composes stable composite key', () => {
    expect(toggleCellKey(3, '2026-01')).toBe('3:2026-01')
  })
})
