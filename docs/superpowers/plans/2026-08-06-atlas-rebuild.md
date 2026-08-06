# Atlas Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved Atlas Rebuild: a living heatmap (layered square tiles, 85% smart-scroll, centered dot-scroller, month hover), an "edition gallery" theme picker with glass tiles + mascot + hover sound preview, bespoke override widgets, a balanced `unpay` sound, a `late`-free ledger with no-page-shake status animation, and a global card-shape system.

**Architecture:** Frontend React 19 + Vite 8 + Tailwind v4 + framer-motion + zustand lives in `guardpay_react/apps/frontend`. Backend FastAPI + SQLAlchemy lives in `guardpay_react/apps/backend`. All tasks are independent, shippable units; each leaves the app compiling and runnable.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`, `noUnusedLocals`, `noUncheckedIndexedAccess`), Tailwind CSS v4, framer-motion, zustand+persist, FastAPI/Pydantic.

## Global Constraints

- TS strict; no enums — use string unions. No unused locals/params/imports (`noUnusedLocals` on).
- No unit-test runner exists. **Verification = `npx tsc -b` (must pass) + `npx vite build` (must pass) + `npx oxlint`** run from `guardpay_react/apps/frontend`. Backend tasks additionally import-check with `python -c "from app.main import app"` from `guardpay_react/apps/backend`.
- Colors always from `resolveTheme()` → `theme.colors` / `var(--…)`; never hardcode hex except the existing status tag palette in `RecordsPage` (`TAG_PALETTE`).
- Preserve existing interaction conventions: toggle-off = theme default, sounds via `useSound`, `prefers-reduced-motion` respected.
- Never mutate real DB rows during verification; settings round-trips restore the prior value.
- Dev: frontend `pnpm dev` (`:5173`, proxies `/api` → `:8420`); backend `uvicorn app.main:app --port 8420`.
- Commit after each task with the message given in the task.

---

### Task 1: Heatmap data model + full labels + month separators

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx:139-203` (`HeatCell`, `buildHeatCells`), `:239-294` (`PaymentHeatmap` render)

**Interfaces:**
- Produces: `HeatCell` gains `monthKey: string`; new `HeatMonth { col: number; label: string; monthKey: string }`; `buildHeatCells` returns `{ cells: HeatCell[]; total: number; months: HeatMonth[] }`; a month is labeled once at the column of its **first day**; the grid renders through the end of the current week.
- Consumes: `buildHeatCells(payments, settings)` signature unchanged from callers.

- [ ] **Step 1: Extend types + rewrite the cell builder**

Replace the `HeatCell` interface (lines 139-146) and `buildHeatCells` (lines 148-203) with:

```ts
interface HeatCell {
  date: Date
  iso: string
  count: number
  level: number
  today: boolean
  col: number
  monthKey: string
}

interface HeatMonth {
  col: number
  label: string
  monthKey: string
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildHeatCells(
  payments: { paidDate: string | null }[],
  settings: { calendarMode?: 'gregorian' | 'ethiopian'; monthLanguage?: 'english' | 'amharic' },
): { cells: HeatCell[]; total: number; months: HeatMonth[] } {
  const byDay = new Map<string, number>()
  for (const p of payments) {
    if (!p.paidDate) continue
    const iso = p.paidDate.slice(0, 10)
    byDay.set(iso, (byDay.get(iso) ?? 0) + 1)
  }
  const today = new Date()
  const todayIsoStr = isoOf(today)

  const start = new Date(today)
  start.setDate(start.getDate() - 370)
  start.setDate(start.getDate() - start.getDay())

  // render through the end of the current week so the last column is full
  const end = new Date(today)
  end.setDate(end.getDate() + (6 - end.getDay()))

  const eth = settings.calendarMode === 'ethiopian'
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const cells: HeatCell[] = []
  const months: HeatMonth[] = []
  const labeled = new Set<string>()
  let total = 0
  let max = 0

  const d = new Date(start)
  let idx = 0
  while (d <= end) {
    const iso = isoOf(d)
    const monthKey = iso.slice(0, 7)
    const col = Math.floor(idx / 7)
    if (d.getDate() === 1 && !labeled.has(monthKey)) {
      labeled.add(monthKey)
      months.push({
        col,
        label: eth ? ethMonthShort(monthKey, settings.monthLanguage ?? 'english') : (names[d.getMonth()] ?? ''),
        monthKey,
      })
    }
    const count = byDay.get(iso) ?? 0
    total += count
    if (count > max) max = count
    cells.push({
      date: new Date(d),
      iso,
      count,
      level: 0,
      today: iso === todayIsoStr,
      col,
      monthKey,
    })
    idx++
    d.setDate(d.getDate() + 1)
  }
  for (const c of cells) {
    if (c.count > 0) c.level = Math.min(5, Math.max(1, Math.ceil((c.count / max) * 5)))
  }
  return { cells, total, months }
}
```

- [ ] **Step 2: All-7-day labels + alignment fix + month separators**

In `PaymentHeatmap`, replace the day-label rail (lines 241-256) and the month header + grid block (lines 257-292). The label rail loses `marginTop: 28` (use `20`) and gets all seven letters; wrap the grid in a `relative` container and render a thin `var(--border)` separator at each month-start column after the first:

```tsx
<div style={{ overflowX: 'auto' }}>
  <div className="flex">
    <div
      className="mr-2 grid text-right font-mono"
      style={{
        gridTemplateRows: `repeat(7, ${cellSize}px)`,
        gap: `${gap}px`,
        marginTop: 20,
        width: 26,
        fontSize: 11,
        lineHeight: `${cellSize}px`,
        color: muted,
      }}
    >
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((letter, i) => (
        <span key={letter} style={{ gridRow: i + 1 }}>
          {letter}
        </span>
      ))}
    </div>
    <div className="min-w-0 flex-1">
      <div className="relative mb-1 font-mono" style={{ height: 16 }}>
        {heat.months.map((m) => (
          <span
            key={m.monthKey}
            className="absolute"
            style={{ left: m.col * pitch + pitch / 2, transform: 'translateX(-50%)', fontSize: 11, color: muted }}
          >
            {m.label}
          </span>
        ))}
      </div>
      <div className="relative">
        {heat.months.slice(1).map((m) => (
          <span
            key={`sep-${m.monthKey}`}
            className="pointer-events-none absolute z-10"
            style={{
              left: m.col * pitch - gap / 2,
              top: 0,
              bottom: 0,
              width: 1,
              background: 'var(--border)',
            }}
            aria-hidden="true"
          />
        ))}
        <div
          className="grid"
          style={{
            gridAutoFlow: 'column',
            gridTemplateRows: `repeat(7, ${cellSize}px)`,
            gridAutoColumns: `${cellSize}px`,
            gap: `${gap}px`,
          }}
        >
          {heat.cells.map((c) => (
            <span
              key={c.iso}
              title={`${c.date.toDateString()} — ${c.count} ${c.count === 1 ? 'payment' : 'payments'}`}
              className="relative rounded-md transition-transform duration-100 hover:z-10 hover:scale-110"
              style={{
                width: cellSize,
                height: cellSize,
                background: c.count === 0 ? lv0 : heatRamp[c.level - 1],
                boxShadow: c.today ? `0 0 0 2px ${accent}` : undefined,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  </div>
</div>
```

Note: the grid no longer uses `justify-between`; cells are left-packed so absolute separator positions align exactly with column starts.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc -b`, `npx oxlint`, `npx vite build` in `guardpay_react/apps/frontend`.
Expected: all pass. In the browser: every weekday letter lines up with its row, exactly one label per month, a thin separator at each month boundary.

```bash
git add guardpay_react/apps/frontend/src/pages/DashboardPage.tsx
git commit -m "feat(frontend): heatmap full week labels, month-key dedupe + separators"
```

---

### Task 2: Layered square heatmap tiles (visual default)

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx` — the cell `<span>` render inside `PaymentHeatmap`

**Interfaces:**
- Produces: cell style applying the "raised 2D tile" look; `shape: 'square' | 'rounded'` in the component (read from settings in Task 3; for now `'square'`).
- Consumes: `heat.cells`, `heatRamp`, `lv0`, `accent`, `cellSize` from the existing component.

- [ ] **Step 1: Apply the layered tile styling**

Replace the cell `<span>` (inside the grid map) so square tiles have very round corners and a layered shadow, today's tile glows:

```tsx
{heat.cells.map((c) => {
  const shape = 'square' // Task 3 replaces this with settings.heatmapShape
  const isSquare = shape === 'square'
  const radius = isSquare ? cellSize * 0.35 : 4
  const shadow = c.today
    ? `0 0 0 2px ${accent}, 0 0 10px ${accent}66`
    : isSquare
      ? '0 1px 2px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.25)'
      : undefined
  return (
    <span
      key={c.iso}
      title={`${c.date.toDateString()} — ${c.count} ${c.count === 1 ? 'payment' : 'payments'}`}
      className="relative transition-transform duration-100 hover:z-10 hover:scale-110"
      style={{ width: cellSize, height: cellSize, background: c.count === 0 ? lv0 : heatRamp[c.level - 1], borderRadius: radius, boxShadow: shadow }}
    />
  )
})}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc -b`, `npx oxlint`, `npx vite build`. In the browser tiles read as individually raised squares (soft drop shadow + top inner highlight) with very round corners; today's cell has a glow ring.

```bash
git add guardpay_react/apps/frontend/src/pages/DashboardPage.tsx
git commit -m "feat(frontend): layered square heatmap tiles with glow"
```

---

### Task 3: `heatmap_shape` setting end-to-end (square/rounded)

**Files:**
- Modify: `guardpay_react/apps/backend/app/core/config.py:17-28`, `guardpay_react/apps/backend/app/schemas/__init__.py:152-162`, `guardpay_react/apps/backend/app/api/settings.py:32-43`
- Modify: `guardpay_react/apps/frontend/src/lib/types.ts:69-80,184-195`, `guardpay_react/apps/frontend/src/features/payments/dataStore.ts:34-60`, `guardpay_react/apps/frontend/src/pages/SettingsPage.tsx` (Calendar section + save payload), `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx` (read shape in `PaymentHeatmap`)

**Interfaces:**
- Produces: backend key `heatmap_shape` (`'square' | 'rounded'`, default `square`); frontend `Settings.heatmapShape` and `ApiSettings.heatmap_shape`; `PaymentHeatmap` reads `useDataStore((s) => s.settings.heatmapShape)`.
- Consumes: existing `SettingsUpdate`/`KNOWN_SETTINGS` mechanism; existing `ToggleRow` component in `SettingsPage`.

- [ ] **Step 1: Backend key + schema + GET**

`config.py` — add to `DEFAULT_SETTINGS`:

```python
    "heatmap_shape": "square",
```

`schemas/__init__.py` — add to `SettingsUpdate` (after `month_language`):

```python
    heatmap_shape: Literal["square", "rounded"] | None = None
```

`api/settings.py` — add to the GET response dict (after `month_language`):

```python
        "heatmap_shape": merged.get("heatmap_shape", "square"),
```

- [ ] **Step 2: Frontend types + store mapping**

`types.ts` `Settings` — add `heatmapShape: 'square' | 'rounded'`. `ApiSettings` — add `heatmap_shape: 'square' | 'rounded'`.

`dataStore.ts` — `emptySettings` add `heatmapShape: 'square'`; `mapSettings` add `heatmapShape: a.heatmap_shape ?? 'square'`.

- [ ] **Step 3: SettingsPage toggle + payload**

In `GeneralTab` Calendar section, after the Ethiopian `ToggleRow` (line ~217), add:

```tsx
<ToggleRow
  label="Square calendar tiles"
  desc="Layered raised tiles on the dashboard payment calendar instead of flat rounded dots."
  checked={draft.heatmapShape === 'square'}
  onChange={(v) => update({ heatmapShape: v ? 'square' : 'rounded' })}
/>
```

In `onSave`'s mutate payload, add `heatmap_shape: draft.heatmapShape,`.

- [ ] **Step 4: PaymentHeatmap consumes the setting**

In `PaymentHeatmap`, read `const heatmapShape = useDataStore((s) => s.settings.heatmapShape)` (add `useDataStore` to the existing imports from `@/features/payments/dataStore`), and in the cell render replace the Task 2 hardcoded `const shape = 'square'` with `const shape = heatmapShape`.

- [ ] **Step 5: Verify + commit**

Run `npx tsc -b`, `npx oxlint`, `npx vite build`; backend `python -c "from app.main import app"` from `guardpay_react/apps/backend`. Live test: GET `/api/settings` shows `heatmap_shape: "square"`; POST `{"heatmap_shape": "rounded"}` then GET returns `"rounded"`; restore with `"square"`.

```bash
git add guardpay_react/apps/backend/app/core/config.py guardpay_react/apps/backend/app/schemas/__init__.py guardpay_react/apps/backend/app/api/settings.py guardpay_react/apps/frontend/src/lib/types.ts guardpay_react/apps/frontend/src/features/payments/dataStore.ts guardpay_react/apps/frontend/src/pages/SettingsPage.tsx guardpay_react/apps/frontend/src/pages/DashboardPage.tsx
git commit -m "feat: heatmap_shape setting (square/rounded) persisted end-to-end"
```

---

### Task 4: 85% smart-scroll, Today chip, month hover highlight

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx` — `PaymentHeatmap`

**Interfaces:**
- Produces: scroll container ref; `hoverMonth: string | null` state; floating "Jump to today" chip; mount effect scrolling today to 85%; hover month label dims other months.
- Consumes: `heat.cells` (today col), `pitch`, `SectionHead` `right` slot.

- [ ] **Step 1: Add refs, state, and the 85% mount effect**

Inside `PaymentHeatmap`, add (verify `useCallback/useEffect/useMemo/useRef/useState` are imported; add any missing ones):

```tsx
const scrollRef = useRef<HTMLDivElement>(null)
const [hoverMonth, setHoverMonth] = useState<string | null>(null)
const [todayHidden, setTodayHidden] = useState(false)

const todayCol = useMemo(() => heat.cells.find((c) => c.today)?.col ?? 0, [heat.cells])

const scrollTodayIntoView = useCallback(() => {
  const el = scrollRef.current
  if (!el) return
  const target = Math.max(0, Math.min(todayCol * pitch - 0.85 * el.clientWidth, el.scrollWidth - el.clientWidth))
  el.scrollTo({ left: target, behavior: 'smooth' })
}, [todayCol, pitch])

useEffect(() => {
  const el = scrollRef.current
  if (!el) return
  el.scrollLeft = Math.max(0, Math.min(todayCol * pitch - 0.85 * el.clientWidth, el.scrollWidth - el.clientWidth))
}, [todayCol, pitch])

useEffect(() => {
  const el = scrollRef.current
  if (!el) return
  const onScroll = () => {
    const target = Math.max(0, Math.min(todayCol * pitch - 0.85 * el.clientWidth, el.scrollWidth - el.clientWidth))
    setTodayHidden(Math.abs(el.scrollLeft - target) > pitch * 1.5)
  }
  el.addEventListener('scroll', onScroll, { passive: true })
  return () => el.removeEventListener('scroll', onScroll)
}, [todayCol, pitch])
```

- [ ] **Step 2: Wire ref + hover opacity + Today chip**

- Add `ref={scrollRef}` to the outer `overflowX: 'auto'` div.
- Month labels: add `tabIndex={0}` plus `onMouseEnter={() => setHoverMonth(m.monthKey)} onMouseLeave={() => setHoverMonth(null)} onFocus={() => setHoverMonth(m.monthKey)} onBlur={() => setHoverMonth(null)}`.
- Cells: add to the `<span>` style — `opacity: hoverMonth && c.monthKey !== hoverMonth ? 0.22 : 1, transition: 'opacity 180ms ease'`.
- In `SectionHead` `right`, render the chip when `todayHidden`:

```tsx
right={
  todayHidden ? (
    <button
      type="button"
      onClick={scrollTodayIntoView}
      className="rounded-full border border-[var(--border-strong)] bg-[var(--card)] px-2.5 py-1 text-xs font-medium transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)]"
    >
      Jump to today
    </button>
  ) : (
    <span className="text-sm text-[var(--muted)]">last 12 months</span>
  )
}
```

- [ ] **Step 3: Verify + commit**

Run `npx tsc -b`, `npx oxlint`, `npx vite build`. In the browser: on load today's column sits ~85% across the heatmap; scrolling away shows "Jump to today" which returns; hovering a month label dims the others to ~22%.

```bash
git add guardpay_react/apps/frontend/src/pages/DashboardPage.tsx
git commit -m "feat(frontend): heatmap 85% smart-scroll, today chip, month hover highlight"
```

---

### Task 5: Centered dot-scroller for the heatmap

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx` (add `HeatScrollbar` component, render under the heatmap), `guardpay_react/apps/frontend/src/index.css` (hide native scrollbar on `.heatmap-scroll`)

**Interfaces:**
- Produces: `HeatScrollbar({ containerRef, pitch }: { containerRef: React.RefObject<HTMLDivElement | null>; pitch: number })` — a centered dot-track ~6–7 tile-widths long, draggable thumb, click-to-seek.
- Consumes: `containerRef` (the heatmap scroll container), `pitch`, themed colors `var(--border)` / `var(--border-strong)`.

- [ ] **Step 1: CSS to hide the native scrollbar**

Append to `index.css` (after line 119, the scrollbar section):

```css
.heatmap-scroll { scrollbar-width: none; }
.heatmap-scroll::-webkit-scrollbar { display: none; }
```

Add `className="heatmap-scroll"` to the heatmap's `overflowX: 'auto'` div.

- [ ] **Step 2: `HeatScrollbar` component**

Add before `function PaymentHeatmap`:

```tsx
function HeatScrollbar({
  containerRef,
  pitch,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  pitch: number
}) {
  const [progress, setProgress] = useState(0) // 0..1
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      setProgress(max > 0 ? el.scrollLeft / max : 0)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    return () => el.removeEventListener('scroll', update)
  }, [containerRef])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current
    const el = containerRef.current
    if (!track || !el) return
    dragging.current = true
    const seek = (clientX: number) => {
      const rect = track.getBoundingClientRect()
      const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      el.scrollLeft = t * (el.scrollWidth - el.clientWidth)
    }
    seek(e.clientX)
    const onMove = (ev: PointerEvent) => seek(ev.clientX)
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const trackW = Math.min(7 * pitch, 120) // centered, ~6-7 tile-widths long
  const thumbW = Math.max(10, trackW * 0.25)

  return (
    <div className="mt-2 flex justify-center">
      <div
        ref={trackRef}
        role="slider"
        aria-label="Calendar scroll"
        aria-valuenow={Math.round(progress * 100)}
        className="relative h-2 cursor-pointer touch-none items-center rounded-full bg-[var(--border)]/60"
        style={{ width: trackW }}
        onPointerDown={onPointerDown}
      >
        <div
          className="absolute h-2 rounded-full bg-[var(--border-strong)]/90"
          style={{
            left: 0,
            width: thumbW,
            transform: `translateX(${progress * (trackW - thumbW)}px)`,
            transition: dragging.current ? 'none' : 'transform 80ms linear',
          }}
        />
      </div>
    </div>
  )
}
```

Render `<HeatScrollbar containerRef={scrollRef} pitch={pitch} />` immediately after the heatmap scroll container's closing `</div>` (inside the Section, under the grid).

- [ ] **Step 3: Verify + commit**

Run `npx tsc -b`, `npx oxlint`, `npx vite build`. In the browser: the native heatmap scrollbar is hidden; a small centered dot-track sits under the calendar; drag/click seeks and the thumb tracks live scroll.

```bash
git add guardpay_react/apps/frontend/src/pages/DashboardPage.tsx guardpay_react/apps/frontend/src/index.css
git commit -m "feat(frontend): centered dot-scroller for the heatmap"
```
### Task 6: `unpay` sound slot + unify toggle sounds

**Files:**
- Modify: `guardpay_react/apps/frontend/src/lib/types.ts:228-236`, `guardpay_react/apps/frontend/src/hooks/useSound.ts` (`PRESETS`, `FILE_BANK`, `playPreset`, `useSound`, `playInternal`), `guardpay_react/apps/frontend/src/features/theming/themes.ts` (all 13 `sound: {...}` blocks), `guardpay_react/apps/frontend/src/pages/RecordsPage.tsx:271`, `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx:362`

**Interfaces:**
- Produces: `SoundPreset` includes `'unpay'`; `SoundTheme` gains `unpay: SoundPreset`; `play('unpay')`/`preview('unpay')` valid; paid→unpaid plays `unpay`, unpaid→paid plays `paid` on both pages.
- Consumes: existing hybrid engine (`FILE_BANK`, `PRESETS`, `playPreset`, `flavorFor`).

- [ ] **Step 1: Types**

`types.ts` — `SoundPreset` add `'unpay'`. `SoundTheme` add `unpay: SoundPreset`.

- [ ] **Step 2: Engine preset + file + always-playable synth**

`useSound.ts`:

- `PRESETS.unpay` — gentle descending chime:

```ts
unpay: [
  { freq: 700, end: 620, dur: 0.1, type: 'sine', gain: 0.06 },
  { freq: 560, end: 500, dur: 0.24, type: 'sine', gain: 0.05 },
],
```

- `FILE_BANK.unpay`:

```ts
unpay: { files: ['/sounds/ding-1.ogg'], gain: 0.5 },
```

- In `playPreset`, change `if (!force) return` to `if (!force && entry?.files.length) return` so the synth fallback still plays for presets whose buffer isn't ready (makes `unpay` audible immediately).

- `useSound` signature: widen both `play` and `preview` param unions to `SoundPreset | 'toggle' | 'paid' | 'error' | 'hover' | 'unpay'`. In `playInternal`, widen the `semantic` union to include `'unpay'` (the `semantic in theme.sound` remap keeps working because `theme.sound.unpay` now exists).

- [ ] **Step 3: Add `unpay` to every theme's `sound`**

For all 13 `ThemeDefinition` entries, add `unpay: 'unpay'` to `sound`. (Sepia example: `sound: { toggle: 'type', paid: 'ding', error: 'error', hover: 'tick', unpay: 'unpay' }`.) Vary per character only if a preset clearly fits (e.g. `midnight-arcade` → `coin`); otherwise keep `'unpay'`.

- [ ] **Step 4: Unify call sites**

`RecordsPage.tsx:271` — `onSuccess: () => play(currentlyPaid ? 'unpay' : 'paid')`.

`DashboardPage.tsx:362` — `onSuccess: () => play(house.paid ? 'unpay' : 'paid')`.

- [ ] **Step 5: Verify + commit**

Run `npx tsc -b`, `npx oxlint`, `npx vite build`. In the browser: marking a paid house unpaid on both Dashboard and Records plays the gentle descending chime; marking unpaid→paid plays the paid preset.

```bash
git add guardpay_react/apps/frontend/src/lib/types.ts guardpay_react/apps/frontend/src/hooks/useSound.ts guardpay_react/apps/frontend/src/features/theming/themes.ts guardpay_react/apps/frontend/src/pages/RecordsPage.tsx guardpay_react/apps/frontend/src/pages/DashboardPage.tsx
git commit -m "feat: unpay sound slot (gentle descending chime) + unified toggle audio"
```

---

### Task 7: Remove `late` from the status model + both scoring engines

**Files:**
- Modify: `guardpay_react/apps/frontend/src/lib/types.ts:17,114`, `guardpay_react/apps/frontend/src/features/scoring/scoring.ts:58,153-197`, `guardpay_react/apps/backend/app/services/scoring.py:36-42`

**Interfaces:**
- Produces: `PaymentStatus = 'ontime' | 'unpaid' | 'upcoming' | 'partial'`; `DashboardStats` without `lateCount`; paid months are always `'ontime'` in both scoring engines.
- Consumes: existing `buildHistory`/`computeHouseStats`/`dashboardStats` consumers (RecordsPage etc. updated in Task 8).

- [ ] **Step 1: Frontend type**

`types.ts`:

```ts
export type PaymentStatus = 'ontime' | 'unpaid' | 'upcoming' | 'partial'
```

Remove `lateCount: number` from `DashboardStats`.

- [ ] **Step 2: Frontend scoring**

`scoring.ts` line 58 — `status: daysDiff <= 0 ? 'ontime' : 'late'` → `status: 'ontime'`.

In `dashboardStats`, remove `let lateCount = 0` (line 166), the `else lateCount++` (line 178), and `lateCount,` (line 192) from the returned object.

- [ ] **Step 3: Backend scoring**

`scoring.py` line 38 — `"status": "ontime" if days_diff <= 0 else "late"` → `"status": "ontime"`.

- [ ] **Step 4: Verify + commit**

Run frontend checks + `python -c "from app.main import app"`. Confirm no `'late'` status literals remain (Task 8 clears the last consumers).

```bash
git add guardpay_react/apps/frontend/src/lib/types.ts guardpay_react/apps/frontend/src/features/scoring/scoring.ts guardpay_react/apps/backend/app/services/scoring.py
git commit -m "feat: remove late status from model and both scoring engines"
```

---

### Task 8: Remove `late` from all consumers (records, data, reports, stamps)

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/RecordsPage.tsx` (lines 91, 95-101, 103-109, 290, 475, 1047-1059, 1123-1124, 1263, 1327, 1339), `guardpay_react/apps/frontend/src/components/shared/StatusStamp.tsx:33-39`, `guardpay_react/apps/frontend/src/pages/DataPage.tsx:47,85`, `guardpay_react/apps/frontend/src/pages/ResidentPage.tsx:24-29`, `guardpay_react/apps/frontend/src/features/exports/reports.tsx` (lines 22, 104, 125, 163, 178, 238, 277)

**Interfaces:**
- Produces: board becomes 3 columns Paid/Unpaid/Due (`BucketKey = 'ontime' | 'unpaid' | 'upcoming'`); partial folds into the Paid bucket but keeps its Partial pill on cards; board count badges aggregate by bucket.
- Consumes: `PaymentStatus` without `late` (Task 7); `statusForMonth`, `computeAllHouseStats`.

- [ ] **Step 1: RecordsPage constants**

- `STATUS_RANK`: `{ ontime: 0, partial: 1, unpaid: 2, upcoming: 3 }`.
- `TAG_PALETTE`: delete the `late` line (partial keeps its purple entry).
- `TAG_LABEL`: delete the `late` line.

- [ ] **Step 2: RecordsPage helpers**

- `paid()` (lines 288-291): `return s === 'ontime'` (partial stays toggle-able to unpaid, matching prior behavior).
- `statuses` filter list (line 475): `['ontime', 'partial', 'unpaid', 'upcoming']`.
- `BucketKey` (line 1047): `'ontime' | 'unpaid' | 'upcoming'`.
- `BOARD_BUCKETS` (lines 1049-1054): remove `{ key: 'late' }` → `[{ key: 'ontime' }, { key: 'unpaid' }, { key: 'upcoming' }]`.
- `bucketFor` (lines 1056-1059):

```ts
function bucketFor(stats: ReturnType<typeof computeAllHouseStats>, house: Household, month: string): BucketKey {
  const s = statusForMonth(stats.get(house.id), month)
  if (s === 'ontime' || s === 'partial') return 'ontime'
  if (s === 'unpaid') return 'unpaid'
  return 'upcoming'
}
```

- `counts` (lines 293-300): aggregate by bucket so board badges match the buckets:

```ts
const counts = useMemo(() => {
  const c: Record<string, number> = {}
  for (const h of rows) {
    const b = bucketFor(stats, h, month)
    c[b] = (c[b] ?? 0) + 1
  }
  return c
}, [rows, stats, month])
```

- `onDragEnd` (lines 1122-1125): `const targetPaid = to === 'ontime'`; `const currentlyPaid = statusForMonth(stats.get(house.id), month) === 'ontime' || statusForMonth(stats.get(house.id), month) === 'partial'`.
- `BoardCard` `isPaid` (line 1263): `const isPaid = status === 'ontime' || status === 'partial'`.
- `initialOrder` (line 1327) and `reconcileOrder` (line 1339): `{ ontime: [], upcoming: [], unpaid: [] }` (drop `late`).

- [ ] **Step 3: StatusStamp + DataPage + ResidentPage + reports**

- `StatusStamp.tsx` `STAMP_META` (33-39): delete the `late` line.
- `DataPage.tsx:47,85`: `return s === 'ontime'`.
- `ResidentPage.tsx` `STATUS_LABEL` (24-29): delete the `late` line.
- `reports.tsx`: line 22 union remove `'late'`; lines 104, 125, 163, 178, 238, 277 — replace `s.status === 'ontime' || s.status === 'late'` (and equivalents) with `=== 'ontime'`.

- [ ] **Step 4: Verify + commit**

Run `npx tsc -b`, `npx oxlint`, `npx vite build`. Grep `rg "'late'" guardpay_react/apps/frontend/src` and `rg "'late'" guardpay_react/apps/backend/app` → no status `'late'` literals. In the browser: board shows Paid/Unpaid/Due; a partial house appears in the Paid column with its Partial pill; count badges match.

```bash
git add guardpay_react/apps/frontend/src/pages/RecordsPage.tsx guardpay_react/apps/frontend/src/components/shared/StatusStamp.tsx guardpay_react/apps/frontend/src/pages/DataPage.tsx guardpay_react/apps/frontend/src/pages/ResidentPage.tsx guardpay_react/apps/frontend/src/features/exports/reports.tsx
git commit -m "feat: drop late from all consumers; board becomes paid/unpaid/due"
```

---

### Task 9: Dashboard "Due" card + smooth isolated status animation

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx` — the register row `<motion.tr>` (line ~436) and the "This month" cell (line ~463), plus a new `MonthStatusCard` component
- Modify: `guardpay_react/apps/frontend/src/components/shared/StatusStamp.tsx` — status-change animation already keyed on `flipKey`; keep, but verify the wrapper cell has stable size

**Interfaces:**
- Produces: rows no longer animate `layout` (no page shake); the status pill is the only animated element; a card-styled "Due" state in the dashboard "This month" field; a fixed-size status cell so Paid↔Due never resizes neighbors.
- Consumes: `statusForMonth(stats, currentMonth)`, `StatusPill`, existing `StatusStamp` flip animation.

- [ ] **Step 1: Remove row layout animation**

On the register `<motion.tr>` (line 436-442), remove the `layout` prop. Keep `initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}` so add/remove still fades.

- [ ] **Step 2: Fixed-size status cell**

The "This month" cell (`<td className="py-2.5">` at line 463) — give the stamp container a stable footprint so label width changes don't shift neighbors:

```tsx
<td className="py-2.5">
  <div className="flex h-7 items-center">
    <MonthStatusCard status={statusForMonth(stats, currentMonth)} />
  </div>
</td>
```

- [ ] **Step 3: `MonthStatusCard` (the "Due" card for the dashboard field)**

Add a component (near `ToggleButton`):

```tsx
function MonthStatusCard({ status }: { status: MonthStatus | null }) {
  const tone =
    status === 'ontime'
      ? 'color-mix(in srgb, var(--success) 14%, transparent)'
      : status === 'partial'
        ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
        : status === 'upcoming'
          ? 'color-mix(in srgb, var(--muted) 14%, transparent)'
          : 'color-mix(in srgb, var(--danger) 14%, transparent)'
  return (
    <span
      className="inline-flex items-center rounded-md border border-[var(--border)] px-1.5 py-0.5"
      style={{ background: tone }}
    >
      <StatusPill status={status} />
    </span>
  )
}
```

Add `import type { MonthStatus } from '@/lib/types'` if not already present. The "Due" label itself comes from `StatusStamp`'s `upcoming → 'Due'` (unchanged in Task 8). Verify in the browser the field reads as a neat card in all four states (Paid/Partial/Due/Unpaid) and toggling only animates the pill, not the row.

- [ ] **Step 4: Verify + commit**

Run `npx tsc -b`, `npx oxlint`, `npx vite build`. In the browser: toggling a payment no longer reflows/jumps the table; the pill pops in place; the "Due" card shows for current-month unpaid houses.

```bash
git add guardpay_react/apps/frontend/src/pages/DashboardPage.tsx
git commit -m "feat(frontend): dashboard due card + isolated status animation (no page shake)"
```
### Task 10: Card-shape system core (types, store, engine, CSS, surface markers)

**Files:**
- Modify: `guardpay_react/apps/frontend/src/lib/types.ts` (add `ShapeId`), `guardpay_react/apps/frontend/src/features/theming/themes.ts` (ThemeDefinition `shape?`, store `shapeOverride`, `ResolveParams`, `resolveTheme`), `guardpay_react/apps/frontend/src/features/theming/ThemeEngine.tsx:69`, `guardpay_react/apps/frontend/src/index.css`
- Modify (add `data-surface`): `guardpay_react/apps/frontend/src/components/ui/card.tsx`, `guardpay_react/apps/frontend/src/components/layout/Layout.tsx:53` (Section), `guardpay_react/apps/frontend/src/components/shared/overlay/Dialog.tsx:100`, `guardpay_react/apps/frontend/src/components/shared/overlay/HoverCard.tsx:49`, `guardpay_react/apps/frontend/src/components/toast/Toast.tsx:48`, `guardpay_react/apps/frontend/src/components/auth/LockScreen.tsx:48`

**Interfaces:**
- Produces: `ShapeId = 'rectangle' | 'square' | 'circle' | 'trapezoid' | 'parallelogram' | 'irregular'`; `theme.shape: ShapeId`; store `shapeOverride: ShapeId | null` + `setShapeOverride`; `ThemeEngine` sets `data-shape` on `<html>`; CSS applies shapes to `[data-surface]`; `data-surface="keep-rect"` escape hatch.
- Consumes: `resolveTheme()` everywhere (unchanged signature).

- [ ] **Step 1: Type + store + resolve**

`types.ts`:

```ts
export type ShapeId = 'rectangle' | 'square' | 'circle' | 'trapezoid' | 'parallelogram' | 'irregular'
```

`themes.ts`:
- `ThemeDefinition` add `shape?: ShapeId` (after `radius`).
- Give per-theme defaults (keep most as the crisp 8px look): `sepia: 'square'`, `botanical: 'square'`, `terminal: 'parallelogram'`, `royal-ledger: 'trapezoid'`, `midnight-arcade: 'irregular'`; all others omit (default `'square'`). Note: `circle` is only ever a user override — never a theme default.
- `ThemeState` add `shapeOverride: ShapeId | null` + `setShapeOverride: (s: ShapeId | null) => void`; init `shapeOverride: null`; setter `setShapeOverride: (s) => set({ shapeOverride: s })`; `resetOverrides` add `shapeOverride: null`.
- `ResolveParams` add `shapeOverride: ShapeId | null`.
- `resolveTheme`: add `shape: s.shapeOverride ?? base.shape ?? 'square'` to the merged object.

- [ ] **Step 2: ThemeEngine sets `data-shape`**

`ThemeEngine.tsx` — read `shapeOverride` from the store, add to the deps array, and after the `data-texture` line (69):

```ts
root.setAttribute('data-shape', theme.shape)
```

Note: `theme.shape` is resolved via `resolveTheme()` at the top of the effect.

- [ ] **Step 3: CSS shape rules + escape hatch**

Append to `index.css` (after the Textures section):

```css
/* ---------- Card shapes (global, replaces radius on card surfaces) ---------- */
[data-shape="rectangle"] [data-surface] { border-radius: 0; }
[data-shape="square"] [data-surface] { border-radius: 8px; }
[data-shape="circle"] [data-surface] { border-radius: 9999px; }
[data-shape="circle"] [data-surface="keep-rect"] { border-radius: 8px; }
[data-shape="trapezoid"] [data-surface] { border-radius: 0; clip-path: polygon(6% 0, 94% 0, 100% 100%, 0 100%); }
[data-shape="parallelogram"] [data-surface] { border-radius: 0; clip-path: polygon(8% 0, 100% 0, 92% 100%, 0 100%); }
[data-shape="irregular"] [data-surface] { border-radius: 0; clip-path: polygon(10% 0, 78% 4%, 100% 28%, 96% 82%, 60% 100%, 8% 92%, 0 55%); }
```

- [ ] **Step 4: Tag the card surfaces**

Add the literal attribute `data-surface` to the root element of: `Card` (`card.tsx`), `Section` (`Layout.tsx` inner wrapper), `Dialog` panel, `HoverCard` panel, `Toast` card, `LockScreen` card. **Long-form content must never be clipped** by a clip-path shape: mark the RecordsPage grid/table wrapper (`RecordsPage.tsx:871`), the DashboardPage register wrapper (`DashboardPage.tsx:417`), DataPage table/card wrappers (`DataPage.tsx:297,355,497`) and the Analytics chart cards as `data-surface="keep-rect"` instead.

- [ ] **Step 5: Verify + commit**

Run `npx tsc -b`, `npx oxlint`, `npx vite build`. In the browser: default theme keeps 8px card corners; switching `shapeOverride` (via the store devtools or the Task 14 picker) changes all `data-surface` cards; clip-path shapes clip cleanly; buttons/inputs (non-surface) keep their radius.

```bash
git add guardpay_react/apps/frontend/src/lib/types.ts guardpay_react/apps/frontend/src/features/theming/themes.ts guardpay_react/apps/frontend/src/features/theming/ThemeEngine.tsx guardpay_react/apps/frontend/src/index.css guardpay_react/apps/frontend/src/components/ui/card.tsx guardpay_react/apps/frontend/src/components/layout/Layout.tsx guardpay_react/apps/frontend/src/components/shared/overlay/Dialog.tsx guardpay_react/apps/frontend/src/components/shared/overlay/HoverCard.tsx guardpay_react/apps/frontend/src/components/toast/Toast.tsx guardpay_react/apps/frontend/src/components/auth/LockScreen.tsx
git commit -m "feat: global card-shape system (data-shape + data-surface)"
```

---

### Task 11: Edition-gallery theme cards (glass tiles, mascot, hover preview)

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/SettingsPage.tsx` — `AppearanceTab` theme card grid (lines 264-303), Character section (lines 371-394)
- Modify: `guardpay_react/apps/frontend/src/pages/AppearancePage.tsx` — mirror the new card treatment (lines 30-95) so both theme pages agree

**Interfaces:**
- Produces: glass tile cards (translucent theme color, backdrop-blur, inner highlight) that show the color through; tiny `<AnimatedMascot sprite={t.sprite} size={24} />` in the corner; minimal title at rest; hover reveals description + chips + a mini dashboard mockup overlay.
- Consumes: `THEME_LIST`, `t.colors`, `t.label`, `t.sprite`, `AnimatedMascot`, `useThemeStore`.

- [ ] **Step 1: New card markup**

Replace the theme-card `<button>` (lines 268-300) with:

```tsx
<button
  key={t.id}
  onClick={() => setTheme(t.id)}
  onMouseEnter={() => setHoverId(t.id)}
  onMouseLeave={() => setHoverId(null)}
  className={cn(
    'group relative overflow-hidden rounded-[var(--radius)] border p-3 text-left transition-all',
    active ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/40' : 'border-[var(--border)] hover:border-[var(--primary)]/50',
  )}
  style={{
    background: `color-mix(in srgb, ${t.colors.card} 78%, transparent)`,
    color: t.colors.foreground,
    backdropFilter: 'blur(6px)',
  }}
>
  <span
    className="pointer-events-none absolute inset-0"
    style={{
      background: `linear-gradient(135deg, color-mix(in srgb, ${t.colors.primary} 26%, transparent), color-mix(in srgb, ${t.colors.accent} 22%, transparent))`,
    }}
    aria-hidden="true"
  />
  <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'color-mix(in srgb, #ffffff 45%, transparent)' }} aria-hidden="true" />
  {active && (
    <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-fg)]">
      <Check size={12} />
    </span>
  )}
  <div className="relative z-10">
    <div className="pr-4 text-sm font-semibold">{t.label}</div>
    <div className="mt-0.5 line-clamp-2 text-[11px] opacity-70">{t.description}</div>
    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-60">
      <span className="rounded bg-black/10 px-1 py-0.5">{t.family}</span>
      <span className="rounded bg-black/10 px-1 py-0.5">{t.font.label}</span>
      {t.texture && <span className="rounded bg-black/10 px-1 py-0.5">{t.texture}</span>}
    </div>
    <span className="pointer-events-none absolute -bottom-0.5 -right-0.5" aria-hidden="true">
      <AnimatedMascot sprite={t.sprite} size={24} />
    </span>
  </div>
  {hoverId === t.id && (
    <div className="pointer-events-none absolute inset-0 z-20 p-3" aria-hidden="true">
      <MiniDashboardPreview colors={t.colors} sprite={t.sprite} />
    </div>
  )}
</button>
```

Add state in `AppearanceTab`: `const [hoverId, setHoverId] = useState<ThemeId | null>(null)`.

- [ ] **Step 2: `MiniDashboardPreview` (hover mockup)**

Add a small decorative mockup component (module scope):

```tsx
function MiniDashboardPreview({ colors, sprite }: { colors: ThemeDefinition['colors']; sprite: MascotSpriteKey }) {
  return (
    <div className="flex h-full flex-col gap-1.5 rounded-md border border-black/10 bg-black/5 p-2" style={{ color: '#111' }}>
      <div className="h-1.5 w-3/4 rounded-sm" style={{ background: colors.primary }} />
      <div className="flex gap-1">
        {[colors.success, colors.success, colors.danger, colors.accent].map((c, i) => (
          <span key={i} className="h-1.5 flex-1 rounded-sm" style={{ background: c }} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="h-4 w-4 self-end" style={{ background: colors.secondary, borderRadius: 4 }}>
          <AnimatedMascot sprite={sprite} size={16} />
        </span>
        <span className="h-4 w-10 rounded-sm" style={{ background: colors.heat[2] ?? colors.accent }} />
      </div>
    </div>
  )
}
```

Add imports: `useState` (already imported), `AnimatedMascot` from `@/components/shared/AnimatedMascot`, `type { ThemeDefinition, MascotSpriteKey, ThemeId }` from `@/features/theming/themes` (ThemeDefinition) and `@/lib/types` (MascotSpriteKey, ThemeId).

- [ ] **Step 3: Character section uses the animated mascot**

Replace the `PixelSprite sprite={resolved.sprite} size={72}` at line 378 with `<AnimatedMascot sprite={resolved.sprite} size={72} />`; keep the surrounding secondary-color tile. (Keep the resident-avatar credit line as-is.)

- [ ] **Step 4: Mirror on AppearancePage**

`AppearancePage.tsx` cards (lines 30-95) — apply the same glass + corner-mascot + preview treatment so the two pages stay consistent (AppearancePage is reachable via its own route; keep its `onSelect` behavior).

- [ ] **Step 5: Verify + commit**

Run `npx tsc -b`, `npx oxlint`, `npx vite build`. In the browser: the gallery reads as glass tiles holding each theme's color; the small mascot sits in the corner; hovering a card shows the mini dashboard mockup; active card has the ring + check.

```bash
git add guardpay_react/apps/frontend/src/pages/SettingsPage.tsx guardpay_react/apps/frontend/src/pages/AppearancePage.tsx
git commit -m "feat(frontend): edition-gallery theme cards with mascot + hover preview"
```

---

### Task 12: Hover sound preview sequence (theme-specific)

**Files:**
- Modify: `guardpay_react/apps/frontend/src/hooks/useSound.ts` (`playInternal` → accept a target theme id; add `previewTheme`), `guardpay_react/apps/frontend/src/pages/SettingsPage.tsx` (hover sequence in `AppearanceTab`)

**Interfaces:**
- Produces: `useSound().previewTheme(name, themeId)` plays a semantic sound using a **specific** theme's mapping (bypasses mute, always force).
- Consumes: `THEMES`/`resolveTheme`, existing `playPreset`/`flavorFor`.

- [ ] **Step 1: Engine support for a target theme**

In `useSound.ts`, refactor `playInternal(name, force)` → `playInternal(name, force, themeId?)`:

```ts
function playInternal(name: SoundPreset | 'toggle' | 'paid' | 'error' | 'hover' | 'unpay', force: boolean, themeId?: string) {
  try {
    const ctx = getCtx()
    if (!ctx) return
    const theme = themeId ? THEMES[themeId as ThemeId] : resolveTheme()
    if (!theme) return
    const semantic = name as 'toggle' | 'paid' | 'error' | 'hover' | 'unpay'
    const resolved = semantic in theme.sound ? theme.sound[semantic] : (name as SoundPreset)
    playPreset(ctx, resolved, flavorFor(theme.id), force)
  } catch {
    /* audio unavailable */
  }
}
```

Import `THEMES` and `type ThemeId` at the top. Keep `play`/`preview` calling `playInternal(name, false/true)`. Add:

```ts
const previewTheme = useCallback((name: SoundPreset | 'toggle' | 'paid' | 'error' | 'hover' | 'unpay', themeId: ThemeId) => {
  playInternal(name, true, themeId)
}, [])
```

Return `previewTheme` from `useSound`.

- [ ] **Step 2: Hover sequence in AppearanceTab**

In `AppearanceTab`, add:

```tsx
const { preview, previewTheme } = useSound()
const hoverTimers = useRef<number[]>([])
const hoverIdRef = useRef<string | null>(null)

const stopHover = () => {
  hoverTimers.current.forEach((t) => window.clearTimeout(t))
  hoverTimers.current = []
}

const startHover = (themeId: ThemeId) => {
  stopHover()
  hoverIdRef.current = themeId
  previewTheme('hover', themeId)
  hoverTimers.current = [
    window.setTimeout(() => hoverIdRef.current === themeId && previewTheme('toggle', themeId), 350),
    window.setTimeout(() => hoverIdRef.current === themeId && previewTheme('paid', themeId), 700),
  ]
}
```

Wire on the card: `onMouseEnter={() => { setHoverId(t.id); startHover(t.id) }}` and `onMouseLeave={() => { setHoverId(null); stopHover(); hoverIdRef.current = null }}` (replacing the plain handlers added in Task 11). Add a `useEffect` cleanup returning `stopHover` on unmount. Add `useRef` to the react import if missing; import `useSound` (already imported in the file? verify and add from `@/hooks/useSound`).

- [ ] **Step 3: Verify + commit**

Run `npx tsc -b`, `npx oxlint`, `npx vite build`. In the browser: hovering a theme card plays that theme's hover → toggle → paid sounds in sequence; leaving stops them; muted state is bypassed for previews.

```bash
git add guardpay_react/apps/frontend/src/hooks/useSound.ts guardpay_react/apps/frontend/src/pages/SettingsPage.tsx
git commit -m "feat: theme-specific hover sound preview sequence"
```

---

### Task 13: Palette icon deep-links to the Appearance tab

**Files:**
- Modify: `guardpay_react/apps/frontend/src/lib/router.tsx` (`Route` prefix matching, `FallbackRoute` prefix matching), `guardpay_react/apps/frontend/src/components/layout/Header.tsx:76-82` (Palette link), `guardpay_react/apps/frontend/src/pages/SettingsPage.tsx` (read `?tab=` from the route)

**Interfaces:**
- Produces: `#/settings?tab=appearance` opens Settings on the Appearance tab; the Palette icon navigates there; exact-route matching still works everywhere else.
- Consumes: `useRouter` (`path`), existing `Route`/`Link`.

- [ ] **Step 1: Router prefix matching**

`router.tsx` `Route`:

```ts
const active = current === path || (path !== '/' && current.startsWith(path))
```

`FallbackRoute`:

```ts
const matched = knownPaths.some((p) => current === p || (p !== '/' && current.startsWith(p)))
```

- [ ] **Step 2: Palette icon target**

`Header.tsx` Palette `Link` (lines 76-82): `to="/settings?tab=appearance"`, keep `aria-label="Appearance"`.

- [ ] **Step 3: SettingsPage reads the tab param**

In `SettingsPage`, add `const { path } = useRouter()` and:

```ts
useEffect(() => {
  const m = path.match(/[?&]tab=(\w+)/)
  if (m && (TABS.some((t) => t.id === m[1]))) setTab(m[1] as TabId)
}, [path])
```

Import `useRouter` from `@/lib/router` and `useEffect` from react.

- [ ] **Step 4: Verify + commit**

Run `npx tsc -b`, `npx oxlint`, `npx vite build`. In the browser: clicking the Palette icon lands on Settings → Appearance & Themes; navigating to `#/settings?tab=appearance` directly also lands there; the 404 fallback doesn't fire; other routes are unaffected.

```bash
git add guardpay_react/apps/frontend/src/lib/router.tsx guardpay_react/apps/frontend/src/components/layout/Header.tsx guardpay_react/apps/frontend/src/pages/SettingsPage.tsx
git commit -m "feat: palette icon deep-links to appearance tab via ?tab= route"
```

---

### Task 14: Bespoke override widgets (typography, density, shapes) in a snap strip

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/SettingsPage.tsx` — Typography (309-324), Density (327-345), Corner radius (347-369) sections; `guardpay_react/apps/frontend/src/index.css` (`.no-scrollbar`)

**Interfaces:**
- Produces: a reusable `SnapStrip` (native horizontal scroll-snap with hidden scrollbar) hosting: font **specimen cards** (show the actual typeface), density **mini-layout previews** (show spacing rhythm), and the **shape glyph picker** (replaces the corner-radius pills). All keep toggle-off = theme default.
- Consumes: `FONTS`, `setFontOverride`/`fontOverride`, `setDensityOverride`/`densityOverride`, `setShapeOverride`/`shapeOverride` (Task 10), `SHAPES` list below.

- [ ] **Step 1: `.no-scrollbar` CSS**

Append to `index.css`:

```css
.no-scrollbar { scrollbar-width: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
```

- [ ] **Step 2: `SnapStrip` + `SpecimenCard` + density preview + shape glyphs**

Add to `AppearanceTab` (above the return), after the existing `densities`/`radii` constants — replace `radii` with a `SHAPES` list:

```tsx
const SHAPES: { id: ShapeId; label: string; clip?: string; radius?: number }[] = [
  { id: 'rectangle', label: 'Rectangle', radius: 0 },
  { id: 'square', label: 'Square', radius: 8 },
  { id: 'circle', label: 'Circle', radius: 9999 },
  { id: 'trapezoid', label: 'Trapezoid', clip: 'polygon(6% 0, 94% 0, 100% 100%, 0 100%)' },
  { id: 'parallelogram', label: 'Parallelogram', clip: 'polygon(8% 0, 100% 0, 92% 100%, 0 100%)' },
  { id: 'irregular', label: 'Irregular', clip: 'polygon(10% 0, 78% 4%, 100% 28%, 96% 82%, 60% 100%, 8% 92%, 0 55%)' },
]
```

Read `shapeOverride`/`setShapeOverride` from the theme store (add to the existing hooks at the top of `AppearanceTab`). Update `overridden` to include `shapeOverride !== null`.

Add module-scope helper components:

```tsx
function SnapStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-1 pb-1">
      {children}
    </div>
  )
}

function SelectorCard({ children, selected, onClick }: { children: React.ReactNode; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-24 shrink-0 snap-center rounded-lg border p-2 text-left transition',
        selected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/30' : 'border-[var(--border)] hover:border-[var(--primary)]/50',
      )}
    >
      {children}
    </button>
  )
}
```

Typography section body (replaces the pill row):

```tsx
<SnapStrip>
  {Object.entries(FONTS).map(([key, pair]) => (
    <SelectorCard key={key} selected={fontOverride === key} onClick={() => setFontOverride(fontOverride === key ? null : key)}>
      <div className="text-2xl font-bold leading-none" style={{ fontFamily: pair.display }}>Ag</div>
      <div className="mt-1.5 truncate text-[11px] font-medium" style={{ fontFamily: 'var(--font-body)' }}>{pair.label}</div>
      <div className="truncate text-[10px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>AaBb 123</div>
    </SelectorCard>
  ))}
</SnapStrip>
```

Density section body (replaces the pill row):

```tsx
<SnapStrip>
  {densities.map((d) => (
    <SelectorCard key={d} selected={densityOverride === d} onClick={() => setDensityOverride(densityOverride === d ? null : d)}>
      <div
        className="flex flex-col rounded-sm border border-[var(--border)] p-1"
        style={{ gap: d === 'compact' ? 3 : d === 'comfortable' ? 7 : 12 }}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-1 rounded-sm bg-[var(--primary)]/60" style={{ padding: `0 ${d === 'compact' ? 4 : d === 'comfortable' ? 9 : 14}px` }} />
        ))}
      </div>
      <div className="mt-1.5 text-center text-[11px] font-medium capitalize">{d}</div>
    </SelectorCard>
  ))}
</SnapStrip>
```

Replace the "Corner radius" section (347-369) — keep the title/kicker "Card shape / How the edges meet", body:

```tsx
<SnapStrip>
  {SHAPES.map((s) => (
    <SelectorCard key={s.id} selected={shapeOverride === s.id} onClick={() => setShapeOverride(shapeOverride === s.id ? null : s.id)}>
      <div className="flex h-10 w-full items-center justify-center">
        <span
          className="block h-8 w-12"
          style={{
            background: 'color-mix(in srgb, var(--primary) 70%, var(--accent) 30%)',
            borderRadius: s.radius ?? 0,
            clipPath: s.clip,
          }}
        />
      </div>
      <div className="mt-1.5 text-center text-[11px] font-medium">{s.label}</div>
    </SelectorCard>
  ))}
</SnapStrip>
<p className="mt-3 text-xs text-[var(--muted)]">
  Shapes apply to big surfaces (cards, dialogs). Buttons and inputs keep the theme radius.
</p>
```

Import `type { ShapeId }` from `@/lib/types`.

- [ ] **Step 3: Verify + commit**

Run `npx tsc -b`, `npx oxlint`, `npx vite build`. In the browser: the Appearance sidebar shows three snap-strips; the typography strip renders each pairing in its own typeface; the density strip shows compact/comfortable/spacious spacing; the shape strip shows silhouettes and switching re-shapes every `data-surface` card; no scrollbars visible on the strips.

```bash
git add guardpay_react/apps/frontend/src/pages/SettingsPage.tsx guardpay_react/apps/frontend/src/index.css
git commit -m "feat(frontend): bespoke override widgets in snap strips (type, density, shapes)"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-06-atlas-rebuild.md`. Tasks 1-14 are independent, shippable units in dependency order (heatmap → sound → status → shapes → gallery → widgets). Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with a two-stage review between tasks, using superpowers:subagent-driven-development.
2. **Inline Execution** — execute tasks in this session using superpowers:executing-plans, batch execution with checkpoints.

Which approach?
