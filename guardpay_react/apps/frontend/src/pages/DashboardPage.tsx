'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Pencil, BellRing, Check, UserRound } from 'lucide-react'
import { useDataStore } from '@/features/payments/dataStore'
import { computeAllHouseStats, dashboardStats, statusForMonth } from '@/features/scoring/scoring'
import { useThemeStore, resolveTheme } from '@/features/theming/themes'
import { Layout, Section, SectionHead } from '@/components/layout/Layout'
import { CountUp, ScoreDots, TierBadge } from '@/components/shared/animations'
import { StatusPill } from '@/components/shared/StatusPill'
import { RecordsEmptyState } from '@/components/shared/RecordsEmptyState'
import { ResidentAvatar } from '@/components/shared/ResidentAvatar'
import { useAvatarPicker } from '@/features/avatars/pickerStore'
import { Mascot } from '@/components/shared/Mascot'
import { ConfettiBurst } from '@/components/shared/ConfettiBurst'
import { HoverCard } from '@/components/shared/overlay/HoverCard'
import { ContextMenu } from '@/components/shared/overlay/ContextMenu'
import { Dialog } from '@/components/shared/overlay/Dialog'
import { InlineEdit } from '@/components/shared/overlay/InlineEdit'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatMoney, currentMonthKey, todayIso, formatDate } from '@/lib/utils'
import { ethMonthShort } from '@/lib/calendar'
import { useTogglePayment, useGuardMutation, useHouseMutation, useReminderMutation, useSaveSettings } from '@/lib/hooks'
import { useSound } from '@/hooks/useSound'
import { Button } from '@/components/ui/button'
import { toastSuccess, toastError } from '@/components/toast/store'
import type { HouseStats, Household, MonthStatus } from '@/lib/types'

export function DashboardPage() {
  const houses = useDataStore((s) => s.houses)
  const payments = useDataStore((s) => s.payments)
  const settings = useDataStore((s) => s.settings)
  const [query, setQuery] = useState('')

  const stats = useMemo(
    () => dashboardStats(houses, payments, settings),
    [houses, payments, settings],
  )
  const houseStats = useMemo(
    () => computeAllHouseStats(houses.filter((h) => h.active), payments, settings),
    [houses, payments, settings],
  )

  const filter = query.trim().toLowerCase()
  const shown = houses
    .filter((h) => h.active)
    .filter(
      (h) =>
        !filter ||
        h.name.toLowerCase().includes(filter) ||
        h.houseNumber.toLowerCase().includes(filter),
    )

  const heatCells = useMemo(() => buildHeatCells(payments, settings), [payments, settings])

  return (
    <Layout>
      <StatStrip stats={stats} />
      <CompletionBand stats={stats} />
      <PaymentHeatmap heat={heatCells} />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HouseholdLedger houses={shown} houseStats={houseStats} onQuery={setQuery} query={query} />
        <div className="flex flex-col gap-4">
          <GuardRail />
          <Section>
            <SectionHead title="On Patrol" kicker={settings.guardName || 'The night watch'} />
            <Mascot />
          </Section>
        </div>
      </div>
    </Layout>
  )
}

function StatStrip({ stats }: { stats: ReturnType<typeof dashboardStats> }) {
  const items = [
    { label: 'Total collected', value: stats.totalCollected, color: 'var(--success)', currency: stats.currency },
    { label: 'Outstanding', value: stats.totalExpected - stats.totalCollected, color: 'var(--danger)', currency: stats.currency },
    { label: 'Completion', value: stats.completionPct, suffix: '%', color: 'var(--accent)', currency: '' },
    { label: 'Avg reliability', value: stats.avgScore, suffix: '/100', color: 'var(--primary)', currency: '' },
  ]
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="p-4">
          <div className="text-xs text-[var(--muted)]">{item.label}</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span style={{ color: item.color }} className="text-xl font-bold">
              {item.currency && <span className="mr-1 text-sm opacity-70">{item.currency}</span>}
              <CountUp value={item.value} />
              {item.suffix}
            </span>
          </div>
        </Card>
      ))}
    </div>
  )
}

function CompletionBand({ stats }: { stats: ReturnType<typeof dashboardStats> }) {
  const pct = stats.completionPct
  const ticks = 20
  const filled = Math.round((pct / 100) * ticks)
  return (
    <Section className="mb-4">
      <SectionHead
        title="Household completion"
        kicker="This month"
        right={<span className="text-sm text-[var(--muted)]">{stats.paidCount} / {stats.totalHouses} paid</span>}
      />
      <div className="flex gap-1.5">
        {Array.from({ length: ticks }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ delay: i * 0.03 }}
            className="h-8 flex-1 rounded-sm"
            style={{
              background: i < filled ? 'var(--primary)' : 'var(--border)',
              transformOrigin: 'bottom',
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span style={{ color: 'var(--accent)' }}>
          <CountUp value={pct} formatter={(n) => `${n}% complete`} />
        </span>
        <span className="text-[var(--muted)]">{stats.totalHouses} households</span>
      </div>
    </Section>
  )
}

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

function PaymentHeatmap({ heat }: { heat: ReturnType<typeof buildHeatCells> }) {
  const themeId = useThemeStore((s) => s.themeId)
  const fontOverride = useThemeStore((s) => s.fontOverride)
  const densityOverride = useThemeStore((s) => s.densityOverride)
  const radiusOverride = useThemeStore((s) => s.radiusOverride)
  const accentOverride = useThemeStore((s) => s.accentOverride)
  const textureOverride = useThemeStore((s) => s.textureOverride)
  const shapeOverride = useThemeStore((s) => s.shapeOverride)
  const theme = useMemo(
    () =>
      resolveTheme({
        themeId,
        fontOverride,
        densityOverride,
        radiusOverride,
        accentOverride,
        textureOverride,
        shapeOverride,
      }),
    [themeId, fontOverride, densityOverride, radiusOverride, accentOverride, textureOverride, shapeOverride],
  )
  const { accent, border, muted } = theme.colors
  const heatRamp = theme.colors.heat
  const lv0 = border
  const heatmapShape = useDataStore((s) => s.settings.heatmapShape)

  const cellSize = 18
  const gap = 4
  const pitch = cellSize + gap

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

  return (
    <Section className="mb-4">
      <SectionHead
        title="Payment Calendar"
        kicker="Collection rhythm"
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
      />
      <div ref={scrollRef} className="heatmap-scroll" style={{ overflowX: 'auto' }}>
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
                tabIndex={0}
                onMouseEnter={() => setHoverMonth(m.monthKey)}
                onMouseLeave={() => setHoverMonth(null)}
                onFocus={() => setHoverMonth(m.monthKey)}
                onBlur={() => setHoverMonth(null)}
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
              {heat.cells.map((c) => {
                const shape = heatmapShape
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
                    style={{ width: cellSize, height: cellSize, background: c.count === 0 ? lv0 : heatRamp[c.level - 1], borderRadius: radius, boxShadow: shadow, opacity: hoverMonth && c.monthKey !== hoverMonth ? 0.22 : 1, transition: 'opacity 180ms ease' }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
      </div>
      <HeatScrollbar containerRef={scrollRef} pitch={pitch} />
      <div className="mt-3 flex flex-wrap items-center justify-between text-[11px]">
        <span className="font-mono text-[var(--muted)]">{heat.total.toLocaleString()} payments logged</span>
        <span className="flex items-center gap-1.5 font-mono text-[var(--muted)]">
          <span>Less</span>
          {heatRamp.map((c) => (
            <span key={c} className="h-3 w-3 rounded-[2px]" style={{ background: c }} />
          ))}
          <span>More</span>
        </span>
      </div>
    </Section>
  )
}

interface HouseStatShown {
  id: number
  paid: boolean
  fee: number
}

function HouseholdLedger({
  houses,
  houseStats,
  query,
  onQuery,
}: {
  houses: ReturnType<typeof useDataStore.getState>['houses']
  houseStats: Map<number, HouseStats>
  query: string
  onQuery: (q: string) => void
}) {
  const currentMonth = currentMonthKey()
  const activePayments = useDataStore((s) => s.payments)
  const toggle = useTogglePayment()
  const { play } = useSound()
  const [editHouse, setEditHouse] = useState<{ id: number; name: string } | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const shows = houses

  // Milestone celebration: when the last active house for this month gets
  // settled, pop a small confetti burst (one-shot).
  const activeHouses = houses.filter((h) => h.active).length
  const paidNow = activePayments.filter(
    (p) => p.monthKey === currentMonth && activeHouses > 0,
  ).length
  const allPaid = activeHouses > 0 && paidNow >= activeHouses
  const prevAllPaid = useRef(allPaid)
  useEffect(() => {
    if (allPaid && !prevAllPaid.current) {
      setCelebrate(true)
      const t = setTimeout(() => setCelebrate(false), 1200)
      prevAllPaid.current = true
      return () => clearTimeout(t)
    }
    prevAllPaid.current = allPaid
  }, [allPaid])

  const onToggle = (house: HouseStatShown) => {
    toggle.mutate(
      {
        house_id: house.id,
        month_key: currentMonth,
        paid: !house.paid,
        date: todayIso(),
        amount: house.fee,
      },
      { onSuccess: () => play(house.paid ? 'unpay' : 'paid') },
    )
  }

  const complete = (house: HouseStatShown) => {
    if (house.paid) return
    toggle.mutate(
      { house_id: house.id, month_key: currentMonth, paid: true, date: todayIso(), amount: house.fee },
      { onSuccess: () => play('paid') },
    )
  }

  const rename = useHouseMutation()
  const addReminder = useReminderMutation()
  const onRename = (houseId: number, next: string) => {
    rename.mutate(
      { id: houseId, name: next },
      { onSuccess: () => play('toggle') },
    )
  }
  const onRemind = (house: { id: number; name: string }) => {
    addReminder.mutate(
      { house_id: house.id, note: '' },
      { onSuccess: () => {
          play('error')
          toastSuccess('Reminder set', `A reminder was queued for ${house.name}.`)
        } },
    )
  }

  return (
    <Section data-surface="keep-rect" className="lg:col-span-2">
      <div className="relative">
        {celebrate && (
          <span className="pointer-events-none absolute -top-2 right-24 z-10">
            <ConfettiBurst size={110} />
          </span>
        )}
        <SectionHead
          title="Who Has Paid"
          kicker="Household register"
          right={
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <Input
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="Search house or resident…"
                className="w-44 pl-8 text-sm"
              />
            </div>
          }
        />
      </div>
      <QuickEntry houses={shows} onComplete={complete} playing={toggle.isPending} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <th className="pb-2">Household</th>
              <th className="pb-2">Reliability</th>
              <th className="pb-2">This month</th>
              <th className="pb-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {(showAll ? shows : shows.slice(0, 40)).map((house) => {
                const stats = houseStats.get(house.id)
                const currentPayment = activePayments.find(
                  (p) => p.houseId === house.id && p.monthKey === currentMonth,
                )
                const paid = !!currentPayment?.paidDate
                return (
<motion.tr
                        key={house.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-t border-[var(--border)]"
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setEditHouse({ id: house.id, name: house.name })
                        }}
                      >
                        <td className="py-2.5 pl-2 pr-2">
                          <HouseCell
                            house={house}
                            currentPayment={currentPayment}
                            stats={stats}
                          />
                        </td>
                        <td className="py-2.5">
                          {stats && (
                            <span className="flex items-center gap-2">
                              <ScoreDots score={stats.reliabilityScore} size={14} />
                              <TierBadge tier={stats.tier} />
                            </span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <div className="flex h-7 items-center">
                            <MonthStatusCard status={statusForMonth(stats, currentMonth)} />
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          <ContextMenu
                            items={[
                              {
                                label: paid ? 'Mark unpaid' : 'Mark paid',
                                icon: <Check size={14} />,
                                onClick: () => onToggle({ id: house.id, paid, fee: house.fee }),
                              },
                              {
                                label: 'Rename household',
                                icon: <Pencil size={14} />,
                                onClick: () => setEditHouse({ id: house.id, name: house.name }),
                              },
                              {
                                label: 'Queue reminder',
                                icon: <BellRing size={14} />,
                                onClick: () => onRemind({ id: house.id, name: house.name }),
                              },
                            ]}
                          >
                            <ToggleButton
                              paid={paid}
                              pending={toggle.isPending}
                              onClick={() => onToggle({ id: house.id, paid, fee: house.fee })}
                            />
                          </ContextMenu>
                        </td>
                      </motion.tr>
                )
              })}
            </AnimatePresence>
          </tbody>
        </table>
        {shows.length === 0 && <RecordsEmptyState searching={query.trim() !== ''} />}
        {shows.length > 40 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 w-full py-2 text-center text-xs text-[var(--muted)] transition-colors hover:text-[var(--primary)]"
          >
            {showAll ? 'Show fewer' : `Show all ${shows.length} households`}
          </button>
        )}
      </div>
      <Dialog
        open={!!editHouse}
        onClose={() => setEditHouse(null)}
        title={`Edit ${editHouse ? houses.find((h) => h.id === editHouse.id)?.name ?? '' : ''}`}
        kicker="Right-click to edit"
      >
        <NameEditor
          house={editHouse}
          onSave={(next) => {
            if (editHouse) onRename(editHouse.id, next)
            setEditHouse(null)
          }}
          onCancel={() => setEditHouse(null)}
        />
      </Dialog>
    </Section>
  )
}

function NameEditor({
  house,
  onSave,
  onCancel,
}: {
  house: { id: number; name: string } | null
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(house?.name ?? '')
  useEffect(() => setValue(house?.name ?? ''), [house])
  if (!house) return null
  const submit = () => {
    const trimmed = value.trim()
    if (trimmed) onSave(trimmed)
  }
  return (
    <div className="space-y-3">
      <div className="text-sm text-[var(--muted-fg)]">Rename this household. Changes sync to the ledger.</div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="space-y-3"
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} aria-label="Household name" autoFocus />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="default" disabled={!value.trim()}>
            Rename
          </Button>
        </div>
      </form>
    </div>
  )
}

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

function ToggleButton({ paid, pending, onClick }: { paid: boolean; pending: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      aria-pressed={paid}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        borderColor: paid ? 'var(--success)' : 'var(--border-strong)',
        background: paid ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'transparent',
        color: paid ? 'var(--success)' : 'var(--muted-fg)',
      }}
    >
      <span className={cn('h-2 w-2 rounded-full', paid ? 'bg-[var(--success)]' : 'bg-[var(--border-strong)]')} />
      {pending ? '…' : paid ? 'Paid' : 'Mark paid'}
    </button>
  )
}

/** Household identity cell with avatar + name and a themed hover card. */
function HouseCell({
  house,
  currentPayment,
  stats,
}: {
  house: Household
  currentPayment?: { paidDate: string | null; amount: number }
  stats?: HouseStats
}) {
  const currency = useDataStore((s) => s.settings.currency)
  const paid = !!currentPayment?.paidDate
  return (
    <HoverCard
      trigger={
        <div className="group flex items-center gap-3">
          <ResidentAvatar house={house} size={34} onClick={() => useAvatarPicker.getState().open(house)} />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium">{house.name}</div>
            <div className="font-mono text-[11px] text-[var(--muted-fg)]">House {house.houseNumber}</div>
          </div>
        </div>
      }
    >
      <div className="flex gap-3">
        <ResidentAvatar house={house} size={56} ring={!paid} onClick={() => useAvatarPicker.getState().open(house)} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-base font-semibold">{house.name}</span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-[var(--muted-fg)]">
            House {house.houseNumber} · {formatMoney(house.fee, currency)}
          </div>
          {stats && (
            <div className="mt-2 flex items-center gap-2">
              <ScoreDots score={stats.reliabilityScore} size={12} />
              <TierBadge tier={stats.tier} />
              <span className="text-xs text-[var(--muted)]">{stats.reliabilityScore}/100</span>
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <StatusPill status={stats ? statusForMonth(stats, currentMonthKey()) : null} />
            {paid && currentPayment?.paidDate && (
              <span className="text-[11px] text-[var(--muted)]">{formatDate(currentPayment.paidDate)}</span>
            )}
          </div>
        </div>
      </div>
    </HoverCard>
  )
}

function GuardRail() {
  const settings = useDataStore((s) => s.settings)
  const guardPayments = useDataStore((s) => s.guardPayments)
  const record = useGuardMutation()
  const saveSettings = useSaveSettings()
  const currentMonth = currentMonthKey()
  const latest = guardPayments.find((g) => g.monthKey === currentMonth)
  const { play } = useSound()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('transfer')
  const [note, setNote] = useState('')

  const onRecord = () => {
    const amt = Number(amount)
    if (Number.isNaN(amt) || amt <= 0) {
      toastError('Invalid amount', 'Enter a positive guard payment.')
      play('error')
      return
    }
    record.mutate(
      {
        month_key: currentMonth,
        amount: amt,
        paid_date: todayIso(),
        method,
        note,
      },
      {
        onSuccess: () => {
          play('paid')
          toastSuccess('Payment recorded', `${formatMoney(amt, settings.currency)} for ${currentMonth}`)
          setAmount('')
          setNote('')
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <Section>
        <SectionHead
          title="Guard Settlement"
          kicker={
            <span className="inline-flex items-center gap-2">
              <UserRound size={12} />
              <InlineEdit
                value={settings.guardName || 'Night watch'}
                onSave={(next) => saveSettings.mutate({ guard_name: next })}
                ariaLabel="Guard name"
                allowContextEdit
              />
            </span>
          }
        />
        <TimiDots />
        <div className="mt-4 space-y-2 text-sm">
          <Row label="Salary" value={formatMoney(settings.guardSalary, settings.currency)} />
          <Row label="Paid this month" value={latest ? formatMoney(latest.amount, settings.currency) : 'Not yet'} />
        </div>
        <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Record payment
          </div>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">
              {settings.currency}
            </span>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="pl-12"
            />
          </div>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            aria-label="Payment method"
          >
            <option value="transfer">Transfer</option>
            <option value="cash">Cash</option>
            <option value="mobile">Mobile</option>
          </select>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          <Button className="w-full" variant="success" onClick={onRecord} disabled={record.isPending}>
            {record.isPending ? 'Saving…' : latest ? 'Update payment' : 'Record payment'}
          </Button>
        </div>
      </Section>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function TimiDots() {
  const avg = useDataStore((s) => {
    const houses = s.houses.filter((h) => h.active)
    if (!houses.length) return 0
    const payments = s.payments
    const settings = s.settings
    let sum = 0
    for (const h of houses) {
      const stats = computeAllHouseStats([h], payments, settings)
      sum += stats.get(h.id)?.reliabilityScore ?? 0
    }
    return Math.round(sum / houses.length)
  })
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <TierBadge tier={avg >= 90 ? 'excellent' : avg >= 70 ? 'reliable' : avg >= 40 ? 'inconsistent' : 'at_risk'} />
        <span className="text-sm text-[var(--muted-fg)]">
          avg <span className="font-bold text-[var(--fg)]">{avg}</span>/100
        </span>
      </div>
    </div>
  )
}

function QuickEntry({
  houses,
  onComplete,
  playing,
}: {
  houses: ReturnType<typeof useDataStore.getState>['houses']
  onComplete: (h: HouseStatShown) => void
  playing: boolean
}) {
  const [value, setValue] = useState('')
  const [feedback, setFeedback] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const currentMonth = currentMonthKey()
  const payments = useDataStore((s) => s.payments)
  const { play } = useSound()

  // Global hotkey: '/' focuses the quick-entry input (unless typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inField = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (inField) return
      if (e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = () => {
    const q = value.trim()
    setValue('')
    if (!q) return
    const house = houses.find(
      (h) => h.houseNumber === q || h.houseNumber.replace(/\D/g, '') === q.replace(/\D/g, ''),
    )
    if (!house) {
      play('error')
      setFeedback({ text: `No house “${q}”`, tone: 'bad' })
      setTimeout(() => setFeedback(null), 1600)
      return
    }
    const paid = payments.some((p) => p.houseId === house.id && p.monthKey === currentMonth && p.paidDate)
    if (paid) {
      play('error')
      setFeedback({ text: `${house.houseNumber} already paid`, tone: 'bad' })
      setTimeout(() => setFeedback(null), 1600)
      return
    }
    onComplete({ id: house.id, paid: false, fee: house.fee })
    setFeedback({ text: `${house.houseNumber} marked paid ✓`, tone: 'ok' })
    setTimeout(() => setFeedback(null), 1600)
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded bg-[var(--border)] px-1 font-mono text-[10px] text-[var(--muted-fg)]">
          /
        </span>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="House # + Enter"
          className="w-44 pl-9 font-mono text-sm"
          aria-label="Quick mark paid"
        />
      </div>
      <button
        onClick={submit}
        disabled={playing || !value.trim()}
        className="rounded-md border border-[var(--border-strong)] px-3 py-2 text-xs font-medium hover:bg-[var(--border)] disabled:opacity-50"
      >
        Mark paid
      </button>
      <span
        className={cn(
          'text-xs',
          feedback?.tone === 'ok' && 'font-medium',
          feedback?.tone === 'ok' ? 'text-[var(--success)]' : 'text-[var(--danger)]',
        )}
      >
        {feedback?.text ?? 'Fast entry — press / then type the house number'}
      </span>
    </div>
  )
}