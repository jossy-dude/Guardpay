import type { HouseStats, Household, MonthEntry, MonthStatus, Payment, Settings } from '@/lib/types'
import { addMonths, currentMonthKey } from '@/lib/utils'

export interface ScoringConfig {
  /** Rolling window of months used to compute the base reliability rate. */
  windowMonths: number
  /** Streak bonus cap (points). */
  streakBonusCap: number
  /** Points per month in the current on-time streak (before cap). */
  streakBonusPerMonth: number
  /** How many tiers to derive — thresholds on the 0-100 scale. */
  tiers: { excellent: number; reliable: number; inconsistent: number }
}

export const DEFAULT_SCORING: ScoringConfig = {
  windowMonths: 12,
  streakBonusCap: 8,
  streakBonusPerMonth: 2,
  tiers: { excellent: 90, reliable: 70, inconsistent: 40 },
}

/**
 * Build the per-month history for one household, from its created month up to `endMonth`.
 * Months with a payment that has a paid_date are resolved; the current month (if unpaid) is "due".
 * Earlier months without payment are "unpaid" once they've passed.
 */
export function buildHistory(
  house: Household,
  payments: Payment[],
  settings: Settings,
  endMonth = new Date(),
): MonthEntry[] {
  const endKey = endMonth instanceof Date ? `${endMonth.getFullYear()}-${String(endMonth.getMonth() + 1).padStart(2, '0')}` : endMonth
  const startKey = house.createdMonth
  const byMonth = new Map<string, Payment>()
  for (const p of payments) {
    if (p.houseId === house.id && p.paidDate) {
      const key = p.monthKey
      const existing = byMonth.get(key)
      if (!existing || (p.paidDate ?? '') > (existing.paidDate ?? '')) byMonth.set(key, p)
    }
  }

  const dueDay = settings.dueDay || 5
  const history: MonthEntry[] = []
  let cur = startKey
  let guard = 0
  while (cur <= endKey && guard < 1200) {
    const pay = byMonth.get(cur)
    const [y, m] = cur.split('-').map(Number)
    if (pay) {
      const paid = new Date(pay.paidDate!)
      const lastDay = new Date(y ?? 2000, (m ?? 1), 0).getDate()
      const due = new Date(y ?? 2000, (m ?? 1) - 1, Math.min(dueDay, lastDay))
      const daysDiff = Math.round((paid.getTime() - due.getTime()) / 86400000)
      history.push({
        monthKey: cur,
        status: 'ontime',
        daysDiff,
        paidDate: pay.paidDate,
        amount: pay.amount || house.fee,
      })
    } else if (cur < endKey) {
      history.push({ monthKey: cur, status: 'unpaid', daysDiff: 999, paidDate: null, amount: null })
    } else {
      // current month: unpaid → "due/upcoming"
      history.push({ monthKey: cur, status: 'upcoming', daysDiff: 999, paidDate: null, amount: null })
    }
    cur = addMonths(cur, 1)
    guard++
  }
  return history
}

/**
 * New 0-100 Reliability Score.
 *
 * Base = weighted on-time percentage over a rolling window (recent months weighted
 * slightly higher so old slip-ups don't dominate). A capped streak bonus rewards
 * current consistency. Result is always on a 0-100 scale regardless of household age.
 */
export function computeHouseStats(
  house: Household,
  payments: Payment[],
  settings: Settings,
  cfg: ScoringConfig = DEFAULT_SCORING,
): HouseStats {
  const history = buildHistory(house, payments, settings)
  const resolved = history.filter((h) => h.status !== 'upcoming')

  let currentStreak = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i]
    if (!entry) break
    if (entry.status === 'upcoming') continue
    if (entry.status === 'ontime') currentStreak++
    else break
  }

  let longest = 0
  let run = 0
  for (const h of history) {
    if (h.status === 'upcoming') continue
    if (h.status === 'ontime') {
      run++
      longest = Math.max(longest, run)
    } else run = 0
  }

  const onTimeCount = resolved.filter((h) => h.status === 'ontime').length
  const onTimeRate = resolved.length ? Math.round((onTimeCount / resolved.length) * 100) : 0

  // Weighted base: recent months inside window weigh more (linear ramp).
  const windowStart = resolved.length > cfg.windowMonths ? resolved.length - cfg.windowMonths : 0
  const inWindow = resolved.slice(windowStart)
  let weightedHit = 0
  let weightedTotal = 0
  inWindow.forEach((h, idx) => {
    const weight = 1 + (idx / Math.max(inWindow.length - 1, 1)) // 1..2
    weightedTotal += weight
    if (h.status === 'ontime') weightedHit += weight
  })
  const base = weightedTotal ? Math.round((weightedHit / weightedTotal) * 100) : 0

  const streakBonus = Math.min(currentStreak * cfg.streakBonusPerMonth, cfg.streakBonusCap)
  const reliabilityScore = Math.max(0, Math.min(100, base + streakBonus))

  const tier: HouseStats['tier'] =
    reliabilityScore >= cfg.tiers.excellent
      ? 'excellent'
      : reliabilityScore >= cfg.tiers.reliable
        ? 'reliable'
        : reliabilityScore >= cfg.tiers.inconsistent
          ? 'inconsistent'
          : 'at_risk'

  const paidMonths = resolved.filter((h) => h.status !== 'unpaid').length
  const totalMonths = resolved.length

  return {
    history,
    resolved,
    currentStreak,
    longestStreak: longest,
    onTimeRate,
    reliabilityScore,
    tier,
    paidMonths,
    totalMonths,
  }
}

export function dashboardStats(
  houses: Household[],
  payments: Payment[],
  settings: Settings,
  monthKey?: string,
) {
  const key = monthKey ?? currentMonthKey()
  const active = houses.filter((h) => h.active)
  const totalHouses = active.length
  let paidCount = 0
  let totalCollected = 0
  let totalExpected = 0
  let onTimeCount = 0
  let scoreSum = 0

  for (const h of active) {
    totalExpected += h.fee
    const stats = computeHouseStats(h, payments, settings)
    scoreSum += stats.reliabilityScore
    const thisMonth = stats.history.find((m) => m.monthKey === key)
    if (thisMonth && thisMonth.status !== 'upcoming' && thisMonth.status !== 'unpaid') {
      paidCount++
      totalCollected += thisMonth.amount ?? h.fee
      if (thisMonth.status === 'ontime') onTimeCount++
    }
  }

  const completionPct = totalHouses ? Math.round((paidCount / totalHouses) * 100) : 0

  return {
    totalHouses,
    paidCount,
    unpaidCount: totalHouses - paidCount,
    totalCollected,
    totalExpected,
    completionPct,
    onTimeCount,
    currency: settings.currency,
    month: key,
    avgScore: totalHouses ? Math.round(scoreSum / totalHouses) : 0,
  }
}

export function computeAllHouseStats(
  houses: Household[],
  payments: Payment[],
  settings: Settings,
): Map<number, HouseStats> {
  const map = new Map<number, HouseStats>()
  for (const h of houses) {
    map.set(h.id, computeHouseStats(h, payments, settings))
  }
  return map
}

/** Resolve a house's payment status for a specific month, or null when the
 *  house wasn't created until after that month (no history entry exists). */
export function statusForMonth(stats: HouseStats | undefined, monthKey: string): MonthStatus | null {
  if (!stats) return null
  const entry = stats.history.find((e) => e.monthKey === monthKey)
  return entry ? entry.status : null
}