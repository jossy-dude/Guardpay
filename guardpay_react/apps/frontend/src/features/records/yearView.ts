// Pure logic for the yearly "All" matrix view. No React here.
import { ETHIOPIAN_MONTHS_AM, ecYearMonthKeys } from '@/lib/calendar'
import { statusForMonth } from '@/features/scoring/scoring'
import type { HouseStats, Household, Payment } from '@/lib/types'

export interface YearColumn {
  /** 1-based Ethiopian month index (1 = Meskerem … 13 = Pagume). */
  monthIndex: number
  amharic: string
  /** Canonical Gregorian YYYY-MM storage key. */
  monthKey: string
}

export function buildYearColumns(ecYear: number): YearColumn[] {
  return ecYearMonthKeys(ecYear).map((monthKey, i) => ({
    monthIndex: i + 1,
    amharic: ETHIOPIAN_MONTHS_AM[i] ?? '',
    monthKey,
  }))
}

export type YearCellKind = 'paid' | 'due' | 'future' | 'preborn'

export interface YearCellState {
  kind: YearCellKind
  payment: Payment | undefined
}

export function resolveYearCell(
  _house: Household,
  _stats: HouseStats | undefined,
  monthKey: string,
  nowKey: string,
  payment: Payment | undefined,
): YearCellState {
  if (payment?.paidDate) return { kind: 'paid', payment }
  if (monthKey > nowKey) return { kind: 'future', payment: undefined }
  // No history entry ⇒ the household did not exist in that month.
  if (!statusForMonth(_stats, monthKey)) return { kind: 'preborn', payment: undefined }
  return { kind: 'due', payment: undefined }
}

export function yearColumnTotals(
  rows: Household[],
  stats: Map<number, HouseStats | undefined>,
  columns: YearColumn[],
  paymentByHouseMonth: Map<string, Payment>,
): { collected: Map<string, number>; expected: Map<string, number> } {
  const collected = new Map<string, number>()
  const expected = new Map<string, number>()
  for (const c of columns) {
    let sum = 0
    let exp = 0
    for (const h of rows) {
      if (statusForMonth(stats.get(h.id), c.monthKey)) exp += h.fee
      const p = paymentByHouseMonth.get(`${h.id}:${c.monthKey}`)
      if (p?.paidDate) sum += p.amount || h.fee
    }
    collected.set(c.monthKey, sum)
    expected.set(c.monthKey, exp)
  }
  return { collected, expected }
}

export function toggleCellKey(houseId: number, monthKey: string): string {
  return `${houseId}:${monthKey}`
}
