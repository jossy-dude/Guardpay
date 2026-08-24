// Ethiopian (Ge'ez) calendar conversion + month names.
// Storage month-keys stay canonical Gregorian "YYYY-MM" everywhere; these pure
// helpers map a Gregorian month-key to an Ethiopian (year, month) for display.

export type CalendarMode = 'gregorian' | 'ethiopian'
export type MonthLanguage = 'english' | 'amharic'

/** Ethiopian month names, index 0 = Meskerem (month 1) .. 12 = Pagume. */
export const ETHIOPIAN_MONTHS_EN: readonly string[] = [
  'Meskerem',
  'Tikimt',
  'Hidar',
  'Tahsas',
  'Tir',
  'Yekatit',
  'Megabit',
  'Miyazya',
  'Ginbot',
  'Sene',
  'Hamle',
  'Nehasse',
  'Pagume',
]

/** Same months in Amharic (Ge'ez) script. */
export const ETHIOPIAN_MONTHS_AM: readonly string[] = [
  'መስከረም',
  'ጥቅምት',
  'ኅዳር',
  'ታኅሣሥ',
  'ጥር',
  'የካቲት',
  'መጋቢት',
  'ሚያዝያ',
  'ግንቦት',
  'ሰኔ',
  'ሐምሌ',
  'ነሐሴ',
  'ጳጉሜ',
]

// --- JDN math (epoch: 1 Meskerem 1 = JDN 1724221) ---

const ETHIOPIAN_EPOCH_JDN = 1724221

export function isEthiopianLeapYear(y: number): boolean {
  return y % 4 === 3
}

export function gregorianToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045
}

export function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044
  const b = Math.floor((4 * a + 3) / 146097)
  const c = a - Math.floor((146097 * b) / 4)
  const d = Math.floor((4 * c + 3) / 1461)
  const e = c - Math.floor((1461 * d) / 4)
  const mm = Math.floor((5 * e + 2) / 153)
  return {
    day: e - Math.floor((153 * mm + 2) / 5) + 1,
    month: mm + 3 - 12 * Math.floor(mm / 10),
    year: 100 * b + d - 4800 + Math.floor(mm / 10),
  }
}

export function ethiopianToJdn(y: number, m: number, d: number): number {
  return ETHIOPIAN_EPOCH_JDN - 1 + 365 * (y - 1) + Math.floor(y / 4) + 30 * (m - 1) + d
}

export function jdnToEthiopian(jdn: number): { year: number; month: number; day: number } {
  const x = jdn - (ETHIOPIAN_EPOCH_JDN - 1)
  const year = Math.floor((4 * x - 1) / 1461) + 1
  const offset = x - (365 * (year - 1) + Math.floor(year / 4) + 1)
  return { year, month: Math.floor(offset / 30) + 1, day: (offset % 30) + 1 }
}

export function gregorianToEthiopian(y: number, m: number, d: number): { year: number; month: number; day: number } {
  return jdnToEthiopian(gregorianToJdn(y, m, d))
}

export function ethiopianToGregorian(y: number, m: number, d: number): { year: number; month: number; day: number } {
  return jdnToGregorian(ethiopianToJdn(y, m, d))
}

/** Map a Gregorian "YYYY-MM" key to an Ethiopian (year, month) using the
 *  month's midpoint date (day 15) as a stable anchor. */
export function monthKeyToEthiopian(monthKey: string): { year: number; month: number } {
  const [y, m] = monthKey.split('-').map(Number)
  const eta = gregorianToEthiopian(y ?? 2000, m ?? 1, 15)
  return { year: eta.year, month: eta.month }
}

export function ethiopianMonthName(month: number, lang: MonthLanguage): string {
  const list = lang === 'amharic' ? ETHIOPIAN_MONTHS_AM : ETHIOPIAN_MONTHS_EN
  return list[Math.max(0, Math.min(list.length - 1, month - 1))]!
}

export function ethMonthLabel(monthKey: string, lang: MonthLanguage): string {
  const { year, month } = monthKeyToEthiopian(monthKey)
  return `${ethiopianMonthName(month, lang)} ${year}`
}

export function ethMonthShort(monthKey: string, lang: MonthLanguage): string {
  const { month } = monthKeyToEthiopian(monthKey)
  return ethiopianMonthName(month, lang)
}

/** Number of days in an Ethiopian month (Pagume = 5, or 6 in leap years). */
export function ethiopianMonthLength(year: number, month: number): number {
  return month === 13 ? (isEthiopianLeapYear(year) ? 6 : 5) : 30
}

/** All 13 Gregorian month-keys covered by an Ethiopian year, in EC order
 *  Meskerem..Pagume. Anchor = day 15, clamped to month length so Pagume
 *  never overflows into the next year's Meskerem. */
export function ecYearMonthKeys(ecYear: number): string[] {
  const keys: string[] = []
  for (let m = 1; m <= 13; m++) {
    const g = ethiopianToGregorian(ecYear, m, Math.min(15, ethiopianMonthLength(ecYear, m)))
    keys.push(`${g.year}-${String(g.month).padStart(2, '0')}`)
  }
  return keys
}

/** Ethiopian year containing today. */
export function currentEthiopianYear(): number {
  const now = new Date()
  return gregorianToEthiopian(now.getFullYear(), now.getMonth() + 1, now.getDate()).year
}