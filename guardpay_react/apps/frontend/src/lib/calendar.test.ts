import { describe, expect, it } from 'vitest'
import { currentEthiopianYear, ecYearMonthKeys, gregorianToEthiopian } from './calendar'

describe('ecYearMonthKeys', () => {
  it('returns 13 keys in EC order for EC2018', () => {
    const keys = ecYearMonthKeys(2018)
    expect(keys).toHaveLength(13)
    // Meskerem 2018 anchors at መስከረም 15 = 2025-09-29ish → 2025-09
    expect(keys[0]).toBe('2025-09')
    // Verified: Hamle 15 = 2026-07-22, Nehasse 15 = 2026-08-21
    expect(keys[10]).toBe('2026-07')
    expect(keys[11]).toBe('2026-08')
  })

  it('anchors Pagume inside the SAME EC year (no overflow into next Meskerem)', () => {
    // Non-leap EC year: Pagume has 5 days; naive day-15 anchor would roll into
    // next year's September. Day-5 anchor must stay in the closing August/September.
    const keys = ecYearMonthKeys(2018)
    // Verified anchor: 2026-09-10 == Pagume 5, 2018 → key '2026-09'
    expect(keys[12]).toBe('2026-09')
    // Pagume 2018 and Meskerem 2019 share Gregorian month '2026-09' by design
    // (Meskerem 15, 2019 == 2026-09-25); the day-5 clamp keeps the anchor date
    // inside Pagume instead of rolling into next year's dates.
    expect(ecYearMonthKeys(2019)[0]).toBe('2026-09')
  })

  it('keys are strictly increasing across the whole EC year', () => {
    const keys = ecYearMonthKeys(2017)
    for (let i = 1; i < keys.length; i++) expect(keys[i]! > keys[i - 1]!).toBe(true)
  })
})

describe('currentEthiopianYear', () => {
  it('maps known dates correctly', () => {
    // 2026-08-24 → 2018-12-18 (Nehasse), still EC2018
    expect(gregorianToEthiopian(2026, 8, 24).year).toBe(2018)
    // 2026-09-11 → Meskerem 1, EC2019
    expect(gregorianToEthiopian(2026, 9, 11).year).toBe(2019)
  })

  it('returns a numeric year for today', () => {
    expect(typeof currentEthiopianYear()).toBe('number')
  })
})
