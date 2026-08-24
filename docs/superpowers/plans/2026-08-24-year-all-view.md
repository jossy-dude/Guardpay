# Yearly "All" View + Ethiopian Calendar Anchoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5th "Year" dataview to RecordsPage — an editable houses × 13-Ethiopian-months matrix (መስከረም→ጳጉሜ) — and fix the month picker to follow the Ethiopian year in EC mode.

**Architecture:** Pure logic (column building, cell-state resolution, footer totals) lives in a new testable module `features/records/yearView.ts`; calendar math extends the existing verified JDN helpers in `lib/calendar.ts`; `RecordsPage.tsx` gains the view type, an EC-aware month list, a year navigator, and the matrix component reusing the existing toggle mutation and table styling conventions.

**Tech Stack:** React 19 + TypeScript strict, Zustand store (existing), TanStack Query mutation (existing `useTogglePayment`), framer-motion (existing page-transition wrapper), vitest (new, node-env only).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-guardpay-master-design.md` §1.
- Storage month-keys stay canonical Gregorian `"YYYY-MM"` everywhere (never store EC).
- Column headers ALWAYS Amharic regardless of language setting (spec decision).
- Working dir for all frontend commands: `guardpay_react/apps/frontend`.
- Package manager: `pnpm`. Linter: oxlint (`.oxlintrc.json`). Typecheck: `pnpm exec tsc -b` (tsconfig project references).
- Do not touch backend files in this sub-project.
- Commit after every task; conventional commits (`feat:`, `test:`, `chore:`).
- Existing patterns to mimic exactly: sticky header/first-col classes from `GridView` (RecordsPage ~949), `data-surface="keep-rect"` card wrapper, `color-mix(in_srgb,…)` hover tints, `cn()` utility.

---

### Task 1: Vitest harness + Ethiopian-year calendar helpers

**Files:**
- Modify: `apps/frontend/package.json` (devDep + script)
- Modify: `apps/frontend/vite.config.ts` (add `test` block)
- Modify: `apps/frontend/src/lib/calendar.ts` (append two exports)
- Test: `apps/frontend/src/lib/calendar.test.ts` (new)

**Interfaces:**
- Produces: `ecYearMonthKeys(ecYear: number): string[]` — 13 Gregorian `YYYY-MM` keys in EC order Meskerem→Pagume; `currentEthiopianYear(): number`. Later tasks consume both.

- [ ] **Step 1: Install vitest**

```bash
cd guardpay_react/apps/frontend && pnpm add -D vitest
```

- [ ] **Step 2: Wire the test block into vite.config.ts**

Add at top of `vite.config.ts`:
```ts
/// <reference types="vitest/config" />
```
and inside `defineConfig({ ... })` add sibling key:
```ts
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
```
Add to `package.json` scripts:
```json
    "test": "vitest run",
```

- [ ] **Step 3: Write failing tests**

Create `src/lib/calendar.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { currentEthiopianYear, ecYearMonthKeys, gregorianToEthiopian } from './calendar'

describe('ecYearMonthKeys', () => {
  it('returns 13 keys in EC order for EC2018', () => {
    const keys = ecYearMonthKeys(2018)
    expect(keys).toHaveLength(13)
    // Meskerem 2018 anchors at መስከረም 15 = 2025-09-29ish → 2025-09
    expect(keys[0]).toBe('2025-09')
    // Tikimt 15 → 2025-10 … Nehasse → 2026-07 (spot-check one middle)
    expect(keys[11]).toBe('2026-07')
  })

  it('anchors Pagume inside the SAME EC year (no overflow into next Meskerem)', () => {
    // Non-leap EC year: Pagume has 5 days; naive day-15 anchor would roll into
    // next year's September. Day-5 anchor must stay in the closing August/September.
    const keys = ecYearMonthKeys(2018)
    // Verified anchor: 2026-09-10 == Pagume 5, 2018 → key '2026-09'
    expect(keys[12]).toBe('2026-09')
    // And it must differ from next year's Meskerem key
    expect(keys[12]).not.toBe(ecYearMonthKeys(2019)[0])
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
})
```

- [ ] **Step 4: Run tests, verify failure**

Run: `pnpm test`
Expected: FAIL — `ecYearMonthKeys` / `currentEthiopianYear` not exported.

- [ ] **Step 5: Implement helpers**

Append to `src/lib/calendar.ts`:
```ts
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
```

- [ ] **Step 6: Run tests, verify pass**

Run: `pnpm test`
Expected: PASS (all).

If the `keys[11]` spot-check fails, do NOT adjust the test blindly — recompute the real Tikimt/Nehasse anchor with `node -e` against the JDN functions and confirm which assertion is wrong before changing either side.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/package.json apps/frontend/pnpm-lock.yaml apps/frontend/vite.config.ts apps/frontend/src/lib/calendar.ts apps/frontend/src/lib/calendar.test.ts
git commit -m "feat(calendar): EC-year month-key helpers + vitest harness"
```

---

### Task 2: Pure year-view logic module

**Files:**
- Create: `apps/frontend/src/features/records/yearView.ts`
- Test: `apps/frontend/src/features/records/yearView.test.ts`

**Interfaces:**
- Consumes: `ecYearMonthKeys`, `ETHIOPIAN_MONTHS_AM` from `@/lib/calendar`; `statusForMonth` from `@/features/scoring/scoring`; types `Household`, `Payment`, `HouseStats` from `@/lib/types`.
- Produces (consumed by Tasks 3–4):
  - `interface YearColumn { monthIndex: number; amharic: string; monthKey: string }`
  - `buildYearColumns(ecYear: number): YearColumn[]`
  - `interface YearCellState { kind: 'paid' | 'due' | 'future' | 'preborn'; payment: Payment | undefined }`
  - `resolveYearCell(house, stats, columns[i].monthKey, nowKey, payment | undefined): YearCellState`
  - `yearColumnTotals(rows, stats, columns, paymentByHouseMonth): { collected: Map<string, number>; expected: Map<string, number> }`
  - `toggleCellKey(houseId: number, monthKey: string): string`

- [ ] **Step 1: Write failing tests**

Create `src/features/records/yearView.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildYearColumns, resolveYearCell, toggleCellKey, yearColumnTotals } from './yearView'
import type { Household, Payment } from '@/lib/types'

const house = (over: Partial<Household> = {}): Household => ({
  id: 1, name: 'H1', houseNumber: '12', fee: 4000, notes: '', active: true,
  createdMonth: '2025-09', avatar: null, openingBalance: 0, ...over,
} as Household)

const pay = (over: Partial<Payment>): Payment => ({
  id: 9, houseId: 1, monthKey: '2025-09', paidDate: '2025-09-03', amount: 4000,
  note: '', source: 'manual', createdAt: '', updatedAt: '', ...over,
} as Payment)

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
    const r = resolveYearCell(house(), undefined, '2026-08', nowKey, undefined)
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
    const rows = [h1, h2]
    const byHM = new Map<string, Payment>([
      [`1:${cols[0]!.monthKey}`, pay({ amount: 4000 })],
      [`2:${cols[0]!.monthKey}`, pay({ houseId: 2, amount: 3000 })],
    ])
    const t = yearColumnTotals(rows, new Map([[1, undefined], [2, undefined]]) as Map<number, never>, cols, byHM)
    expect(t.collected.get(cols[0]!.monthKey)).toBe(7000)
    expect(t.expected.get(cols[0]!.monthKey)).toBeGreaterThan(0)
  })
})

describe('toggleCellKey', () => {
  it('composes stable composite key', () => {
    expect(toggleCellKey(3, '2026-01')).toBe('3:2026-01')
  })
})
```

Note: `resolveYearCell`'s `stats` param may be `undefined` in these tests — the implementation must tolerate that (treat missing stats as preborn for past months, due for present, future ahead). `statusForMonth(undefined)` already returns `null`.

- [ ] **Step 2: Run tests, verify failure**

Run: `pnpm test`
Expected: FAIL — module `./yearView` not found.

- [ ] **Step 3: Implement `yearView.ts`**

```ts
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
      exp += h.fee
      const p = paymentByHouseMonth.get(`${h.id}:${c.monthKey}`)
      if (p?.paidDate) sum += p.amount || h.fee
      void stats // stats reserved for future preborn-exclusion of expected
    }
    collected.set(c.monthKey, sum)
    expected.set(c.monthKey, exp)
  }
  return { collected, expected }
}

export function toggleCellKey(houseId: number, monthKey: string): string {
  return `${houseId}:${monthKey}`
}
```

Then refine `expected`: houses that did not exist in that month shouldn't count. Replace inner loop body's `exp += h.fee` with:
```ts
      if (statusForMonth(stats.get(h.id), c.monthKey)) exp += h.fee
```
and drop the `void stats` line plus the `Map<number, never>` cast comment in the test (pass real `new Map()` typed `Map<number, HouseStats | undefined>`; update test to expect `expected.get(...)).toBe(7000)` since both houses exist in Meskerem 2018 given `createdMonth: '2025-09'`).

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm test`
Expected: PASS. Fix the totals test typing as described rather than weakening the implementation.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/records/
git commit -m "feat(records): pure year-matrix column/cell/totals logic"
```

---

### Task 3: RecordsPage wiring — view id, EC month list, composite pending keys

**Files:**
- Modify: `apps/frontend/src/pages/RecordsPage.tsx`

**Interfaces:**
- Consumes: `currentEthiopianYear`, `ecYearMonthKeys` from `@/lib/calendar`; `buildYearColumns`, `toggleCellKey`, `yearColumnTotals`, `resolveYearCell` from `@/features/records/yearView`.
- Produces: `ViewId` includes `'year'`; `onToggle(house, currentlyPaid, note?, monthKey?)` extended signature; `viewProps.pendingKeys: Set<string>`.

- [ ] **Step 1: Extend ViewId + VIEWS + persistence**

At line ~63 change:
```ts
type ViewId = 'table' | 'board' | 'gallery' | 'list' | 'year'
```
In `VIEWS` array append (import `CalendarRange` from `lucide-react` alongside existing icons):
```ts
  { id: 'year', label: 'Year', icon: CalendarRange },
```
In `usePersistedView` (line ~116) extend the guard:
```ts
    return saved === 'table' || saved === 'board' || saved === 'gallery' || saved === 'list' || saved === 'year'
      ? saved
      : 'table'
```

- [ ] **Step 2: EC-aware month list (the ordering bug fix)**

Replace the `months` useMemo (lines ~203-212):
```ts
  const months = useMemo(() => {
    if (settings.calendarMode === 'ethiopian') {
      // Ethiopian year runs Meskerem (Sep) → Pagume; anchor the picker to the
      // CURRENT EC year instead of a rolling Gregorian window.
      return ecYearMonthKeys(monthKeyToEthiopian(nowKey).year)
    }
    const arr: string[] = []
    let cur = addMonths(nowKey, -(MONTHS_BACK - 1))
    for (let i = 0; i < MONTHS_BACK; i++) {
      arr.push(cur)
      cur = addMonths(cur, 1)
    }
    return arr.reverse()
    // keyed on the current month so the picker advances past midnight
  }, [nowKey, settings.calendarMode])
```
Add imports: `ecYearMonthKeys, monthKeyToEthiopian` from `@/lib/calendar` (merge into any existing calendar import; none exists in RecordsPage yet — add new line).
Guard: if current `month` isn't in the new list after mode switch, snap: add effect
```ts
  useEffect(() => {
    if (!months.includes(month)) setMonth(months.includes(nowKey) ? nowKey : (months[months.length - 1] ?? month))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync only when the list itself changes
  }, [months])
```
(oxlint: drop the disable comment if its ruleset doesn't flag exhaustive-deps.)

- [ ] **Step 3: Composite pending-toggle keys + extended onToggle**

Change state init (line ~197):
```ts
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set())
```
Replace `onToggle` (lines ~274-296):
```ts
  const onToggle = (house: Household, currentlyPaid: boolean, note?: string, monthKeyOverride?: string) => {
    const mk = monthKeyOverride ?? month
    const pKey = toggleCellKey(house.id, mk)
    setPendingToggles((prev) => new Set(prev).add(pKey))
    toggle.mutate(
      {
        house_id: house.id,
        month_key: mk,
        paid: !currentlyPaid,
        date: todayIso(),
        amount: house.fee,
        note: note ?? '',
      },
      {
        onSettled: () => {
          setPendingToggles((prev) => {
            const next = new Set(prev)
            next.delete(pKey)
            return next
          })
        },
        onSuccess: () => play(currentlyPaid ? 'unpay' : 'paid'),
      },
    )
  }
```
Update `viewProps.isToggling` (line ~331):
```ts
    isToggling: (id: number) => pendingToggles.has(toggleCellKey(id, month)),
```
and add to `viewProps`:
```ts
    pendingKeys: pendingToggles,
```

- [ ] **Step 4: Fix all existing isToggling consumers**

`GridView`/`ListView` receive `isToggling(house.id)` — unchanged (still bound to `month`). Search file for other `.has(` / `pendingToggles` usages (Board/Gallery cards) and convert any direct `Set<number>` assumptions to the composite form the same way. Verify with: `rg -n "pendingToggles|isToggling" src/pages/RecordsPage.tsx`.

- [ ] **Step 5: Typecheck + lint + existing behavior intact**

Run: `pnpm exec tsc -b && pnpm exec oxlint src/pages/RecordsPage.tsx && pnpm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/RecordsPage.tsx
git commit -m "feat(records): year view-type plumbing, EC-anchored month picker, composite pending keys"
```

---

### Task 4: YearView matrix component + navigator

**Files:**
- Modify: `apps/frontend/src/pages/RecordsPage.tsx` (add components + render branch)

**Interfaces:**
- Consumes: everything from Task 2/3 interfaces; `formatMoney` from `@/lib/utils`; `HouseIdentity`, `RecordsEmptyState` (existing local components); `cn` from `@/lib/cn`.

- [ ] **Step 1: Year navigator state**

In `RecordsPage()` add (near `usePersistedView`):
```ts
  const [ecYear, setEcYear] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem('records-ec-year')
      const n = saved ? Number(saved) : NaN
      return Number.isFinite(n) && n >= 1 ? n : currentEthiopianYear()
    } catch {
      return currentEthiopianYear()
    }
  })
  const navYear = (delta: number) =>
    setEcYear((y) => {
      const next = y + delta
      try {
        window.localStorage.setItem('records-ec-year', String(next))
      } catch {
        /* storage unavailable */
      }
      return next
    })
  const yearColumns = useMemo(() => buildYearColumns(ecYear), [ecYear])
```

- [ ] **Step 2: Render branch + navigator swap**

Import `YearView` pieces (defined below in same file). In the AnimatePresence body (line ~454 area) add:
```tsx
          {view === 'year' && (
            <YearMatrixView
              rows={rows}
              stats={stats}
              columns={yearColumns}
              ecYear={ecYear}
              onNavYear={navYear}
              query={query}
              payments={payments}
              pendingKeys={pendingToggles}
              onToggleCell={onToggle}
              onAdd={() => setAdding(true)}
            />
          )}
```
In `SectionHead` right slot (line ~346) swap pickers:
```tsx
        right={
          view === 'year' ? (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-9 px-2" onClick={() => navYear(-1)} aria-label="Previous year">‹</Button>
              <span className="min-w-[92px] text-center text-sm font-semibold tabular-nums">{ecYear} ዓ.ም</span>
              <Button size="sm" variant="outline" className="h-9 px-2" onClick={() => navYear(1)} aria-label="Next year" disabled={ecYear >= currentEthiopianYear()}>›</Button>
            </div>
          ) : (
            <MonthPicker months={months} value={month} onChange={setMonth} />
          )
        }
```

- [ ] **Step 3: Implement YearMatrixView**

Add near the other view components (before `GalleryView`). Full component:
```tsx
/* ---------------- Year matrix view (houses × 13 EC months) ---------------- */

function YearMatrixView({
  rows, stats, columns, ecYear, onNavYear, query, payments, pendingKeys, onToggleCell, onAdd,
}: {
  rows: Household[]
  stats: Map<number, HouseStats | undefined>
  columns: YearColumn[]
  ecYear: number
  onNavYear: (delta: number) => void
  query: string
  payments: Payment[]
  pendingKeys: Set<string>
  onToggleCell: (house: Household, currentlyPaid: boolean, note?: string, monthKey?: string) => void
  onAdd: () => void
}) {
  const nowKey = currentMonthKey()
  const byHouseMonth = useMemo(() => {
    const m = new Map<string, Payment>()
    for (const p of payments) m.set(`${p.houseId}:${p.monthKey}`, p)
    return m
  }, [payments])
  const totals = useMemo(
    () => yearColumnTotals(rows, stats, columns, byHouseMonth),
    [rows, stats, columns, byHouseMonth],
  )

  return (
    <div data-surface="keep-rect" className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <button type="button" onClick={() => onNavYear(-1)} aria-label="Previous year"
          className="rounded-md px-2 py-1 text-sm text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] hover:text-[var(--fg)]">‹</button>
        <span className="text-[13px] font-semibold tracking-wide tabular-nums text-[var(--fg)]">{ecYear} ዓ.ም · መስከረም – ጳጉሜ</span>
        <button type="button" onClick={() => onNavYear(1)} aria-label="Next year" disabled={ecYear >= currentEthiopianYear()}
          className="rounded-md px-2 py-1 text-sm text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_6%,transparent)] hover:text-[var(--fg)] disabled:opacity-40 disabled:hover:bg-transparent">›</button>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse text-[14px] leading-[22px]">
          <thead>
            <tr className="text-left text-[11px] leading-[16px] text-[var(--muted)]">
              <th scope="col" className="sticky left-0 top-0 z-20 min-w-[190px] border-b border-r border-[var(--border-strong)] bg-[var(--card)] px-3.5 py-2 font-normal">
                ቤት
              </th>
              {columns.map((c) => (
                <th key={c.monthIndex} scope="col" aria-sort={undefined}
                  className={cn(
                    'sticky top-0 z-10 whitespace-nowrap border-b border-r border-[var(--border-strong)] px-2 py-2 text-center font-normal',
                    c.monthKey === nowKey && 'bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]',
                  )}
                >
                  <span className="block">{c.amharic}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((house) => {
              const s = stats.get(house.id)
              return (
                <tr key={house.id} className="group transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]">
                  <td className={cn(
                    'sticky left-0 z-10 border-b border-r border-[var(--border)] bg-[var(--card)] px-3.5 py-2.5',
                    'transition-colors group-hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]',
                  )}>
                    <span className="text-[13px] font-medium text-[var(--fg)]">{house.houseNumber}</span>
                    <span className="ml-2 truncate text-[13px] text-[var(--muted)]">{house.name}</span>
                  </td>
                  {columns.map((c) => {
                    const payment = byHouseMonth.get(`${house.id}:${c.monthKey}`)
                    const cell = resolveYearCell(house, s, c.monthKey, nowKey, payment)
                    const busy = pendingKeys.has(toggleCellKey(house.id, c.monthKey))
                    if (cell.kind === 'paid') {
                      const day = cell.payment?.paidDate?.slice(8, 10) ?? ''
                      return (
                        <td key={c.monthIndex} className="border-b border-r border-[var(--border)] p-0.5 text-center">
                          <button type="button" disabled={busy}
                            aria-label={`${house.houseNumber} ${c.amharic} ተከፍሏል`}
                            onClick={() => onToggleCell(house, true, undefined, c.monthKey)}
                            className="mx-auto flex h-8 w-full min-w-[52px] items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--success)_22%,transparent)] text-[12px] font-semibold tabular-nums text-[var(--fg)] transition-transform active:scale-95 disabled:opacity-50">
                            {busy ? '…' : `✓${day ? ` ${day}` : ''}`}
                          </button>
                        </td>
                      )
                    }
                    if (cell.kind === 'preborn' || cell.kind === 'future') {
                      return (
                        <td key={c.monthIndex} className="border-b border-r border-[var(--border)] p-0.5 text-center text-[var(--muted)] opacity-40">
                          <span className="mx-auto flex h-8 w-full min-w-[52px] items-center justify-center rounded-md border border-dashed border-[var(--border)] text-[11px]">
                            {cell.kind === 'future' ? '·' : '—'}
                          </span>
                        </td>
                      )
                    }
                    return (
                      <td key={c.monthIndex} className="border-b border-r border-[var(--border)] p-0.5 text-center">
                        <button type="button" disabled={busy}
                          aria-label={`${house.houseNumber} ${c.amharic} አልከፈለም`}
                          onClick={() => onToggleCell(house, false, undefined, c.monthKey)}
                          className="mx-auto flex h-8 w-full min-w-[52px] items-center justify-center rounded-md border border-[var(--border)] text-[12px] text-[var(--muted)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-95 disabled:opacity-50">
                          {busy ? '…' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {/* footer totals */}
            <tr className="bg-[color-mix(in_srgb,var(--fg)_3%,var(--card))] text-[11px] tabular-nums text-[var(--muted)]">
              <td className="sticky left-0 z-10 border-r border-t border-[var(--border-strong)] bg-[var(--card)] px-3.5 py-2 font-medium">ጠቅላላ</td>
              {columns.map((c) => (
                <td key={c.monthIndex} className="whitespace-nowrap border-r border-t border-[var(--border)] px-2 py-2 text-center" title={`collected ${totals.collected.get(c.monthKey) ?? 0} / expected ${totals.expected.get(c.monthKey) ?? 0}`}>
                  {(totals.collected.get(c.monthKey) ?? 0) >= 1000
                    ? `${Math.round((totals.collected.get(c.monthKey) ?? 0) / 1000)}k`
                    : (totals.collected.get(c.monthKey) ?? 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        {rows.length === 0 && <RecordsEmptyState searching={query.trim() !== ''} onAdd={query ? undefined : onAdd} />}
      </div>
    </div>
  )
}
```

Imports to add at top of RecordsPage (merge into existing import lists):
```ts
import CalendarRange from lucide… // add to existing lucide-react import braces
import { currentEthiopianYear, ecYearMonthKeys, monthKeyToEthiopian } from '@/lib/calendar'
import { buildYearColumns, resolveYearCell, toggleCellKey, yearColumnTotals } from '@/features/records/yearView'
import type { YearColumn } from '@/features/records/yearView'
```
`currentMonthKey` already imported.

- [ ] **Step 4: Typecheck + lint + tests**

Run: `pnpm exec tsc -b && pnpm exec oxlint src && pnpm test`
Expected: clean. Fix any `noUncheckedIndexedAccess` complaints with the `?? ''` / `!`-free patterns shown.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/RecordsPage.tsx
git commit -m "feat(records): editable yearly Amharic matrix view with totals + year nav"
```

---

### Task 5: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full quality gate**

```bash
cd guardpay_react/apps/frontend && pnpm test && pnpm exec tsc -b && pnpm exec oxlint src && pnpm build
```
Expected: all green; build completes.

- [ ] **Step 2: Smoke-test against running server**

Server serves the built frontend, so restart it after Step 1's build:
```bash
pkill -f "uvicorn app.main:app"; sleep 1
cd guardpay_react && nohup ./cli/ledger --no-build > /tmp/opencode/guardpay-server.log 2>&1 & sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8420/   # expect 200
```

Manual checklist (report results to owner):
1. Records → Year tab visible among Table/Board/Gallery/List
2. Columns read መስከረም…ጳጉሜ with `2018 ዓ.ም` navigator (today = Aug 2026)
3. Toggle a cell → sound plays, ✓ + day appears, Dashboard reflects it
4. Un-toggle → reverts
5. Future months (none in EC2018 since ጳጉሜ ends Aug/Sep) and pre-house months show locked dashes
6. Footer totals match a hand count for one month
7. Month picker (Table view) in EC mode starts at መስከረም and contains exactly 13 entries
8. Switching calendarMode to Gregorian restores old rolling picker
9. Sticky first column survives horizontal scroll; sticky header on vertical scroll
10. Refresh persists last viewed year

- [ ] **Step 3: Final commit (if any fixes were needed)**

```bash
git add -A && git commit -m "fix(records): year-view verification fixes"
```
