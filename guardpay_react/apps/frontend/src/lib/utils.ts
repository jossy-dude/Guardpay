// Formatting & date utilities

import type { Settings } from '@/lib/types'
import { ethMonthLabel, ethMonthShort } from '@/lib/calendar'

export function formatMoney(amount: number, currency = 'ETB'): string {
  return `${Number(amount).toLocaleString()} ${currency}`
}

export function formatNumber(n: number): string {
  return Number(n).toLocaleString()
}

export function currentMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthKeyToLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })
}

export function monthKeyToShort(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'short' })
}

/** Calendar-aware long month label ("June 2026" or "Sene 2018" / "ሰኔ 2018"). */
export function calendarMonthLabel(monthKey: string, settings: Pick<Settings, 'calendarMode' | 'monthLanguage'>): string {
  return settings.calendarMode === 'ethiopian' ? ethMonthLabel(monthKey, settings.monthLanguage) : monthKeyToLabel(monthKey)
}

/** Calendar-aware short month label ("Jun" or "Sene" / "ሰኔ"). */
export function calendarMonthShort(monthKey: string, settings: Pick<Settings, 'calendarMode' | 'monthLanguage'>): string {
  return settings.calendarMode === 'ethiopian' ? ethMonthShort(monthKey, settings.monthLanguage) : monthKeyToShort(monthKey)
}

export function addMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y ?? 2000, (m ?? 1) - 1 + delta, 1)
  return currentMonthKey(d)
}

/** Last N month keys ending at the current month. */
export function lastMonthsKeys(n: number): string[] {
  const start = addMonths(currentMonthKey(), -(n - 1))
  return monthRange(start, currentMonthKey())
}

/** English "Sep 2026" labels for the last N months (for the import template). */
export function lastMonthsLabels(n: number): string[] {
  return lastMonthsKeys(n).map((k) => monthKeyToShort(k).replace('.', '') + ' ' + k.slice(0, 4))
}

/** Parse a flexible month label ("Sep 2026", "September 2026", "2026-09") into
 *  a canonical YYYY-MM key. Returns null if unparsable. */
export function parseMonthLabel(label: string): string | null {
  const s = label.trim()
  const strict = /^(\d{4})-(\d{2})$/.exec(s)
  if (strict) return `${strict[1]}-${strict[2]}`
  const date = new Date(`1 ${s}`)
  if (Number.isNaN(date.getTime())) return null
  return currentMonthKey(date)
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function monthRange(startMonth: string, endMonth: string): string[] {
  const months: string[] = []
  let cur = startMonth
  while (cur <= endMonth && months.length < 1200) {
    months.push(cur)
    cur = addMonths(cur, 1)
  }
  return months
}

export function monthKeyOf(dateIso: string): string {
  return dateIso.slice(0, 7)
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
