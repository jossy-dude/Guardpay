'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BellRing,
  CalendarDays,
  Check,
  Columns3,
  Filter as FilterIcon,
  Images,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  SquareKanban,
  Trash2,
  X,
} from 'lucide-react'
import { useDataStore } from '@/features/payments/dataStore'
import { computeAllHouseStats, statusForMonth } from '@/features/scoring/scoring'
import { Layout, SectionHead } from '@/components/layout/Layout'
import { ScoreDots, TierBadge } from '@/components/shared/animations'
import { PaymentAdjust } from '@/components/shared/PaymentAdjust'
import { RecordsEmptyState } from '@/components/shared/RecordsEmptyState'
import { StatusStamp } from '@/components/shared/StatusStamp'
import { ResidentAvatar } from '@/components/shared/ResidentAvatar'
import { useAvatarPicker } from '@/features/avatars/pickerStore'
import { HoverCard } from '@/components/shared/overlay/HoverCard'
import { ContextMenu, type MenuItem } from '@/components/shared/overlay/ContextMenu'
import { Dialog } from '@/components/shared/overlay/Dialog'
import { Popover, PopoverTrigger, PopoverContent, usePopover } from '@/components/shared/overlay/Popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useTogglePayment, useHouseMutation, useDeleteHouse, useReminderMutation } from '@/lib/hooks'
import { useSound } from '@/hooks/useSound'
import { toastSuccess, toastError } from '@/components/toast/store'
import { addMonths, calendarMonthLabel, calendarMonthShort, currentMonthKey, formatMoney, todayIso } from '@/lib/utils'
import { cn } from '@/lib/cn'
import type { Household, HouseStats, MonthStatus, Payment } from '@/lib/types'

type ViewId = 'table' | 'board' | 'gallery' | 'list'
type SortKey = 'houseNumber' | 'name' | 'status' | 'score' | 'tier' | 'streak' | 'fee'
type ColumnKey = Exclude<SortKey, 'name'>

const VIEWS: { id: ViewId; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'table', label: 'Table', icon: Columns3 },
  { id: 'board', label: 'Board', icon: SquareKanban },
  { id: 'gallery', label: 'Gallery', icon: Images },
  { id: 'list', label: 'List', icon: List },
]

interface Column {
  key: ColumnKey
  label: string
  numeric?: boolean
}

const COLUMNS: Column[] = [
  { key: 'houseNumber', label: 'Household' },
  { key: 'status', label: 'This month' },
  { key: 'score', label: 'Score', numeric: true },
  { key: 'tier', label: 'Tier' },
  { key: 'streak', label: 'Streak', numeric: true },
  { key: 'fee', label: 'Fee', numeric: true },
]

const ACTION_W = '3.5rem'

const MONTHS_BACK = 12
const STATUS_RANK: Record<MonthStatus, number> = { ontime: 0, late: 1, partial: 2, unpaid: 3, upcoming: 4 }

/* ---------------- AnyType tag palette (10-color system) ---------------- */
/** Payment status → AnyType tag colors (text on very-light bg). */
const TAG_PALETTE: Record<MonthStatus, { text: string; bg: string }> = {
  ontime: { text: '#0caaa3', bg: '#d9f6f4' }, // teal
  late: { text: '#d3720d', bg: '#fff2d7' }, // orange
  partial: { text: '#9e30c4', bg: '#f3e8ff' }, // purple
  unpaid: { text: '#e2400c', bg: '#ffede9' }, // red
  upcoming: { text: '#4f6af0', bg: '#e4e8fc' }, // blue
}

const TAG_LABEL: Record<MonthStatus, string> = {
  ontime: 'Paid',
  late: 'Late',
  partial: 'Partial',
  unpaid: 'Unpaid',
  upcoming: 'Due',
}

/* ---------------- Tiers → AnyType tag colors ---------------- */
const TIER_TAG: Record<HouseStats['tier'], { text: string; bg: string; label: string }> = {
  excellent: { text: '#4aad00', bg: '#ecfcca', label: 'Excellent' },
  reliable: { text: '#1a8ac4', bg: '#ddf1fc', label: 'Reliable' },
  inconsistent: { text: '#d3720d', bg: '#fff2d7', label: 'Inconsistent' },
  at_risk: { text: '#e2400c', bg: '#ffede9', label: 'At risk' },
}

function usePersistedView(): [ViewId, (v: ViewId) => void] {
  const [view, setView] = useState<ViewId>(() => {
    if (typeof window === 'undefined') return 'table'
    const saved = window.localStorage.getItem('records-view')
    return saved === 'table' || saved === 'board' || saved === 'gallery' || saved === 'list' ? saved : 'table'
  })
  const setAndPersist = (v: ViewId) => {
    setView(v)
    try {
      window.localStorage.setItem('records-view', v)
    } catch {
      /* storage unavailable */
    }
  }
  return [view, setAndPersist]
}

const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  houseNumber: true,
  status: true,
  score: true,
  tier: true,
  streak: true,
  fee: true,
}

const COLUMN_FRACTIONS: Record<ColumnKey, string> = {
  houseNumber: '1.6fr',
  status: '1fr',
  score: '0.7fr',
  tier: '0.7fr',
  streak: '0.5fr',
  fee: '0.7fr',
}

function usePersistedColumns(): [Record<ColumnKey, boolean>, (k: ColumnKey) => void] {
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>(() => {
    if (typeof window === 'undefined') return { ...DEFAULT_COLUMNS }
    const saved = window.localStorage.getItem('records-columns')
    if (!saved) return { ...DEFAULT_COLUMNS }
    try {
      return { ...DEFAULT_COLUMNS, ...(JSON.parse(saved) as Partial<Record<ColumnKey, boolean>>) }
    } catch {
      return { ...DEFAULT_COLUMNS }
    }
  })
  const toggle = (k: ColumnKey) => {
    setVisible((prev) => {
      const next = { ...prev, [k]: !prev[k] }
      try {
        window.localStorage.setItem('records-columns', JSON.stringify(next))
      } catch {
        /* storage unavailable */
      }
      return next
    })
  }
  return [visible, toggle]
}

export function RecordsPage() {
  const houses = useDataStore((s) => s.houses)
  const payments = useDataStore((s) => s.payments)
  const settings = useDataStore((s) => s.settings)
  const toggle = useTogglePayment()
  const reminder = useReminderMutation()
  const { play } = useSound()

  const [view, setView] = usePersistedView()
  const [visibleColumns, toggleColumn] = usePersistedColumns()
  const [month, setMonth] = useState(currentMonthKey())
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<MonthStatus | null>(null)
  const [sort, setSort] = useState<SortKey>('houseNumber')
  const [asc, setAsc] = useState(true)

  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Household | null>(null)
  const [deleting, setDeleting] = useState<Household | null>(null)
  const [pendingToggles, setPendingToggles] = useState<Set<number>>(new Set())

  const active = useMemo(() => houses.filter((h) => h.active), [houses])
  const stats = useMemo(() => computeAllHouseStats(active, payments, settings), [active, payments, settings])

  const months = useMemo(() => {
    const arr: string[] = []
    let cur = addMonths(currentMonthKey(), -(MONTHS_BACK - 1))
    for (let i = 0; i < MONTHS_BACK; i++) {
      arr.push(cur)
      cur = addMonths(cur, 1)
    }
    return arr.reverse()
  }, [])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = active.filter(
      (h) =>
        !q ||
        h.name.toLowerCase().includes(q) ||
        h.houseNumber.toLowerCase().includes(q) ||
        h.notes.toLowerCase().includes(q),
    )
    if (statusFilter) {
      list = list.filter((h) => (statusForMonth(stats.get(h.id), month) ?? 'upcoming') === statusFilter)
    }
    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sort === 'score') cmp = (stats.get(a.id)?.reliabilityScore ?? 0) - (stats.get(b.id)?.reliabilityScore ?? 0)
      else if (sort === 'streak') cmp = (stats.get(a.id)?.currentStreak ?? 0) - (stats.get(b.id)?.currentStreak ?? 0)
      else if (sort === 'fee') cmp = a.fee - b.fee
      else if (sort === 'status') {
        const sa = statusForMonth(stats.get(a.id), month) ?? 'upcoming'
        const sb = statusForMonth(stats.get(b.id), month) ?? 'upcoming'
        cmp = STATUS_RANK[sa] - STATUS_RANK[sb]
      } else if (sort === 'tier') {
        cmp = (stats.get(a.id)?.tier ?? '').localeCompare(stats.get(b.id)?.tier ?? '')
      } else if (sort === 'name') cmp = a.name.localeCompare(b.name)
      else cmp = a.houseNumber.localeCompare(b.houseNumber, undefined, { numeric: true })
      return asc ? cmp : -cmp
    })
    return list
  }, [active, query, sort, asc, stats, month, statusFilter])

  const onSort = (key: SortKey) => {
    if (sort === key) setAsc((v) => !v)
    else {
      setSort(key)
      setAsc(true)
    }
  }

  const paymentFor = (house: Household) => payments.find((p) => p.houseId === house.id && p.monthKey === month)

  const onToggle = (house: Household, currentlyPaid: boolean) => {
    setPendingToggles((prev) => new Set(prev).add(house.id))
    toggle.mutate(
      {
        house_id: house.id,
        month_key: month,
        paid: !currentlyPaid,
        date: todayIso(),
        amount: house.fee,
      },
      {
        onSettled: () => {
          setPendingToggles((prev) => {
            const next = new Set(prev)
            next.delete(house.id)
            return next
          })
        },
        onSuccess: () => play(currentlyPaid ? 'toggle' : 'paid'),
      },
    )
  }

  const onRemind = (house: Household) => {
    reminder.mutate(
      { house_id: house.id },
      {
        onSuccess: () => {
          play('error')
          toastSuccess('Reminder set', `A reminder was queued for ${house.name}.`)
        },
      },
    )
  }

  const paid = (house: Household) => {
    const s = statusForMonth(stats.get(house.id), month)
    return s === 'ontime' || s === 'late'
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const h of rows) {
      const s = statusForMonth(stats.get(h.id), month) ?? 'upcoming'
      c[s] = (c[s] ?? 0) + 1
    }
    return c
  }, [rows, stats, month])

  const viewProps = {
    rows,
    stats,
    month,
    query,
    paymentFor,
    paid,
    isToggling: (id: number) => pendingToggles.has(id),
    onToggle,
    onEdit: setEditing,
    onDelete: setDeleting,
    onRemind,
    onAdd: () => setAdding(true),
  }

  const activeFilterCount = (statusFilter ? 1 : 0) + (query.trim() ? 1 : 0)

  return (
    <Layout>
      <SectionHead
        title="Records"
        kicker="Household × month · database"
        right={<MonthPicker months={months} value={month} onChange={setMonth} />}
      />

      {/* ---- Dataview controls bar (AnyType BlockDataviewControls) ---- */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2">
        <ViewTabs value={view} onChange={setView} />
        <div className="mx-1 h-6 w-px bg-[var(--border)]" />
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-8 w-full pl-8"
          />
        </div>
        <FilterMenu value={statusFilter} onChange={setStatusFilter} />
        <SortMenu sort={sort} asc={asc} onSort={onSort} />
        <ViewOptionsMenu view={view} visible={visibleColumns} onToggle={toggleColumn} />
        <div className="mx-1 h-6 w-px bg-[var(--border)]" />
        <Button size="sm" className="h-8 gap-1 px-3" onClick={() => setAdding(true)}>
          <Plus size={13} />
          New
        </Button>
      </div>

      {/* ---- Filter chips row (AnyType BlockDataviewFilters) ---- */}
      {(activeFilterCount > 0 || statusFilter) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {statusFilter && (
            <FilterChip
              onRemove={() => setStatusFilter(null)}
              onClick={() => setStatusFilter(null)}
            >
              Status · is · {TAG_LABEL[statusFilter]}
            </FilterChip>
          )}
          {query.trim() && (
            <FilterChip onRemove={() => setQuery('')}>
              Search · {query.trim()}
            </FilterChip>
          )}
          {(activeFilterCount > 0) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter(null)
                setQuery('')
              }}
              className="h-7 rounded-full px-3 text-xs text-[var(--muted)] transition-colors hover:text-[var(--danger)]"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {view === 'table' && <GridView {...viewProps} sort={sort} asc={asc} onSort={onSort} visible={visibleColumns} />}
          {view === 'board' && <BoardView {...viewProps} counts={counts} />}
          {view === 'gallery' && <GalleryView {...viewProps} />}
          {view === 'list' && <ListView {...viewProps} sort={sort} asc={asc} onSort={onSort} visible={visibleColumns} />}
        </motion.div>
      </AnimatePresence>

      <HouseFormDialog
        house={editing}
        open={!!editing || adding}
        defaultFee={settings.defaultFee}
        onClose={() => {
          setEditing(null)
          setAdding(false)
        }}
      />
      <DeleteConfirmDialog house={deleting} onClose={() => setDeleting(null)} />
    </Layout>
  )
}

/* ---------------- Dataview controls ---------------- */

function ViewTabs({ value, onChange }: { value: ViewId; onChange: (v: ViewId) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {VIEWS.map((v) => {
        const active = value === v.id
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
              active
                ? 'bg-[color-mix(in_srgb,var(--fg)_8%,transparent)] text-[var(--fg)] shadow-[inset_0_-2px_0_0_var(--primary)]'
                : 'text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--fg)]',
            )}
          >
            <v.icon size={14} />
            {v.label}
          </button>
        )
      })}
    </div>
  )
}

function FilterMenu({
  value,
  onChange,
}: {
  value: MonthStatus | null
  onChange: (v: MonthStatus | null) => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
          value
            ? 'bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]'
            : 'text-[var(--muted)] hover:bg-[var(--border)] hover:text-[var(--fg)]',
        )}
      >
        <FilterIcon size={14} />
        Filter
        {value && <span className="rounded-full bg-[var(--primary)] px-1.5 text-[10px] text-[var(--primary-fg)]">1</span>}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="min-w-[220px] p-2">
        <FilterMenuBody value={value} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}

function FilterMenuBody({
  value,
  onChange,
}: {
  value: MonthStatus | null
  onChange: (v: MonthStatus | null) => void
}) {
  const { close } = usePopover()
  const statuses: MonthStatus[] = ['ontime', 'late', 'partial', 'unpaid', 'upcoming']
  return (
    <>
      <div className="mb-1 px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Status</div>
      {statuses.map((s) => {
        const active = value === s
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(active ? null : s)}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
              active ? 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]' : 'hover:bg-[var(--border)]',
            )}
          >
            <TagPill status={s} />
            {active && <Check size={14} className="text-[var(--primary)]" />}
          </button>
        )
      })}
      {value !== null && (
        <div className="mt-2 border-t border-[var(--border)] pt-2">
          <button
            type="button"
            onClick={() => {
              onChange(null)
              close()
            }}
            className="w-full rounded-md px-2 py-1.5 text-left text-[13px] text-[var(--muted)] transition-colors hover:bg-[var(--border)] hover:text-[var(--danger)]"
          >
            Clear all
          </button>
        </div>
      )}
    </>
  )
}

function SortMenu({ sort, asc, onSort }: { sort: SortKey; asc: boolean; onSort: (k: SortKey) => void }) {
  return (
    <Popover>
      <PopoverTrigger className="h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--border)] hover:text-[var(--fg)]">
        <ArrowUpDown size={14} />
        Sort
        {sort !== 'houseNumber' && (
          <span className="rounded-full bg-[var(--primary)] px-1.5 text-[10px] text-[var(--primary-fg)]">1</span>
        )}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="min-w-[220px] p-2">
        <SortMenuBody sort={sort} asc={asc} onSort={onSort} />
      </PopoverContent>
    </Popover>
  )
}

function SortMenuBody({ sort, asc, onSort }: { sort: SortKey; asc: boolean; onSort: (k: SortKey) => void }) {
  const { close } = usePopover()
  const options: Column[] = COLUMNS
  return (
    <>
      <div className="mb-1 px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Sort by</div>
      {options.map((c) => {
        const active = sort === c.key
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              onSort(c.key)
              close()
            }}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
              active ? 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]' : 'hover:bg-[var(--border)]',
            )}
          >
            <span className={cn(active && 'font-medium text-[var(--primary)]')}>{c.label}</span>
            <span className="flex items-center gap-0.5">
              {active && (asc ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
            </span>
          </button>
        )
      })}
    </>
  )
}

function ViewOptionsMenu({
  view,
  visible,
  onToggle,
}: {
  view: ViewId
  visible: Record<ColumnKey, boolean>
  onToggle: (k: ColumnKey) => void
}) {
  const hideable = COLUMNS.filter((c) => c.key !== 'houseNumber' && (view === 'table' || c.key !== 'tier'))
  return (
    <Popover>
      <PopoverTrigger
        aria-label="View options"
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--border)] hover:text-[var(--fg)]"
      >
        <SlidersHorizontal size={14} />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="min-w-[180px] p-2">
        <ViewOptionsMenuBody hideable={hideable} visible={visible} onToggle={onToggle} />
      </PopoverContent>
    </Popover>
  )
}

function ViewOptionsMenuBody({
  hideable,
  visible,
  onToggle,
}: {
  hideable: Column[]
  visible: Record<ColumnKey, boolean>
  onToggle: (k: ColumnKey) => void
}) {
  return (
    <>
      <div className="mb-1 px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Columns</div>
      {hideable.map((c) => {
        const active = visible[c.key]
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onToggle(c.key)}
            aria-pressed={active}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
              active ? 'text-[var(--fg)]' : 'text-[var(--muted)]',
              'hover:bg-[var(--border)] hover:text-[var(--fg)]',
            )}
          >
            <span>{c.label}</span>
            <span
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors',
                active ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border-strong)]',
              )}
            >
              {active && <Check size={11} strokeWidth={3} className="text-[var(--primary-fg)]" />}
            </span>
          </button>
        )
      })}
    </>
  )
}

function FilterChip({ children, onRemove, onClick }: { children: React.ReactNode; onRemove: () => void; onClick?: () => void }) {
  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 text-xs text-[var(--fg)] transition-colors',
        onClick && 'cursor-pointer hover:bg-[var(--border)]',
      )}
    >
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        aria-label="Remove filter"
        className="rounded-full p-0.5 text-[var(--muted)] transition-colors hover:bg-[var(--border)] hover:text-[var(--fg)]"
      >
        <X size={11} />
      </button>
    </span>
  )
}

function MonthPicker({ months, value, onChange }: { months: string[]; value: string; onChange: (m: string) => void }) {
  const current = currentMonthKey()
  const settings = useDataStore((s) => s.settings)
  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Select month"
        className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-medium text-[var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] lg:hidden"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {calendarMonthLabel(m, settings)}
            {m === current ? ' (now)' : ''}
          </option>
        ))}
      </select>
      <div className="hidden items-center gap-1 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 lg:flex">
        <CalendarDays size={13} className="mx-1 shrink-0 text-[var(--muted)]" />
        {months.map((m) => {
          const active = m === value
          return (
            <button
              key={m}
              onClick={() => onChange(m)}
              className={cn(
                'shrink-0 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                active ? 'bg-[var(--primary)] text-[var(--primary-fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]',
              )}
              title={calendarMonthLabel(m, settings)}
            >
              {m === current ? 'Now' : calendarMonthShort(m, settings)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- AnyType tag pill ---------------- */

function TagPill({ status, className, index }: { status: MonthStatus; className?: string; index?: number }) {
  return <StatusStamp status={status} index={index ?? 0} className={className} />
}

function TierPill({ tier }: { tier: HouseStats['tier'] }) {
  const t = TIER_TAG[tier]
  return (
    <span className="inline-flex h-6 items-center rounded-full px-1.5 text-[13px] leading-6" style={{ background: t.bg, color: t.text }}>
      {t.label}
    </span>
  )
}

/* ---------------- Shared bits ---------------- */

interface ViewProps {
  rows: Household[]
  stats: ReturnType<typeof computeAllHouseStats>
  month: string
  query: string
  paymentFor: (house: Household) => Payment | undefined
  paid: (house: Household) => boolean
  isToggling: (houseId: number) => boolean
  onToggle: (house: Household, currentlyPaid: boolean) => void
  onEdit: (house: Household) => void
  onDelete: (house: Household) => void
  onRemind: (house: Household) => void
  onAdd: () => void
}

function SortButton({
  col,
  sort,
  asc,
  onSort,
  numeric,
}: {
  col: Column
  sort: SortKey
  asc: boolean
  onSort: (k: SortKey) => void
  numeric?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(col.key)}
      className={cn(
        'inline-flex cursor-pointer select-none items-center gap-1 whitespace-nowrap font-normal hover:text-[var(--fg)]',
        numeric && 'justify-end',
      )}
    >
      {col.label}
      {sort === col.key ? (
        asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />
      ) : (
        <ArrowUpDown size={12} className="opacity-40" />
      )}
    </button>
  )
}

function HouseIdentity({
  house,
  stats,
  status,
}: {
  house: Household
  stats: HouseStats | undefined
  status: MonthStatus | null
}) {
  return (
    <HoverCard
      trigger={
        <span className="flex min-w-0 items-center gap-2.5">
          <ResidentAvatar house={house} size={26} onClick={() => useAvatarPicker.getState().open(house)} />
          <span className="min-w-0">
            <span className="block font-mono text-xs text-[var(--primary)]">{house.houseNumber}</span>
            <span className="block truncate text-sm font-medium text-[var(--fg)]" title={house.name}>
              {house.name}
            </span>
          </span>
        </span>
      }
    >
      <div className="flex items-center gap-3">
        <ResidentAvatar house={house} size={44} onClick={() => useAvatarPicker.getState().open(house)} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{house.name}</div>
          <div className="text-xs text-[var(--muted)]">
            House {house.houseNumber} · {formatMoney(house.fee)}
          </div>
        </div>
      </div>
      {stats && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ScoreDots score={stats.reliabilityScore} size={14} />
            <TierBadge tier={stats.tier} />
            <span className="font-mono text-xs">{stats.reliabilityScore}</span>
          </span>
          {status && <TagPill status={status} />}
        </div>
      )}
      {house.notes && <p className="mt-3 text-xs text-[var(--muted-fg)]">{house.notes}</p>}
    </HoverCard>
  )
}

function RowActions({
  house,
  isPaid,
  isToggling,
  onToggle,
  onEdit,
  onDelete,
  onRemind,
}: {
  house: Household
  isPaid: boolean
  isToggling: boolean
  onToggle: (house: Household, currentlyPaid: boolean) => void
  onEdit: (house: Household) => void
  onDelete: (house: Household) => void
  onRemind: (house: Household) => void
}) {
  const items: MenuItem[] = [
    {
      label: isPaid ? 'Mark unpaid' : 'Mark paid',
      icon: <Check size={14} />,
      onClick: () => onToggle(house, isPaid),
      disabled: isToggling,
    },
    { label: 'Edit household', icon: <Pencil size={14} />, onClick: () => onEdit(house) },
    { label: 'Queue reminder', icon: <BellRing size={14} />, onClick: () => onRemind(house) },
    { label: 'Delete household', icon: <Trash2 size={14} />, onClick: () => onDelete(house), danger: true },
  ]
  return (
    <ContextMenu items={items} clickToOpen>
      <button
        type="button"
        aria-label={`Actions for ${house.houseNumber} · ${house.name}`}
        aria-haspopup="menu"
        className="rounded-md p-1.5 text-[var(--muted)] opacity-0 transition hover:bg-[var(--border)] hover:text-[var(--fg)] focus:opacity-100 group-hover:opacity-100"
      >
        <MoreHorizontal size={15} />
      </button>
    </ContextMenu>
  )
}

function PaymentNote({ payment, className }: { payment?: Payment; className?: string }) {
  if (!payment?.note) return null
  return (
    <span className={cn('max-w-40 truncate text-[11px] text-[var(--muted)]', className)} title={payment.note}>
      {payment.note}
    </span>
  )
}

/* ---------------- Table view (AnyType ViewGrid) ---------------- */

function GridView({ rows, stats, month, query, sort, asc, onSort, paymentFor, paid, isToggling, onToggle, onEdit, onDelete, onRemind, onAdd, visible }: ViewProps & { sort: SortKey; asc: boolean; onSort: (k: SortKey) => void; visible: Record<ColumnKey, boolean> }) {
  const visibleCols = COLUMNS.filter((c) => c.key === 'houseNumber' || visible[c.key])
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse text-[14px] leading-[22px]">
          <thead>
            <tr className="text-left text-[12px] leading-[20px] text-[var(--muted)]">
              {visibleCols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort === c.key ? (asc ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'sticky top-0 z-10 select-none whitespace-nowrap border-b border-r border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--fg)_3%,var(--card))] px-3.5 py-2.5 font-normal',
                    c.key === 'houseNumber' && 'sticky left-0 z-20',
                    c.numeric && 'text-right',
                  )}
                >
                  <SortButton col={c} sort={sort} asc={asc} onSort={onSort} numeric={c.numeric} />
                </th>
              ))}
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-r border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--fg)_3%,var(--card))] px-3.5 py-2.5"
              >
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((house) => {
              const s = stats.get(house.id)
              const status = statusForMonth(s, month)
              const isPaid = paid(house)
              const payment = paymentFor(house)
              return (
                <tr
                  key={house.id}
                  className="group transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]"
                >
                  <td
                    className={cn(
                      'sticky left-0 z-10 border-b border-r border-[var(--border)] bg-[var(--card)] px-3.5 py-3',
                      'transition-colors group-hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]',
                    )}
                  >
                    <HouseIdentity house={house} stats={s} status={status} />
                  </td>
                  {visibleCols
                    .filter((c) => c.key !== 'houseNumber')
                    .map((c) => (
                      <TableCell
                        key={c.key}
                        col={c}
                        house={house}
                        s={s}
                        status={status}
                        isPaid={isPaid}
                        payment={payment}
                        month={month}
                        isToggling={isToggling(house.id)}
                        onToggle={onToggle}
                      />
                    ))}
                  <td className="border-b border-r border-[var(--border)] px-3.5 py-3 text-right">
                    <RowActions
                      house={house}
                      isPaid={isPaid}
                      isToggling={isToggling(house.id)}
                      onToggle={onToggle}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onRemind={onRemind}
                    />
                  </td>
                </tr>
              )
            })}
            {rows.length > 0 && (
              <tr>
                <td
                  colSpan={visibleCols.length + 1}
                  className="border-b border-[var(--border)] px-3.5 py-2.5"
                >
                  <button
                    type="button"
                    onClick={onAdd}
                    className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--primary)]"
                  >
                    <Plus size={14} />
                    New object
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length === 0 && <RecordsEmptyState searching={query.trim() !== ''} onAdd={query ? undefined : onAdd} />}
      </div>
    </div>
  )
}

function TableCell({
  col,
  house,
  s,
  status,
  isPaid,
  payment,
  month,
  isToggling,
  onToggle,
}: {
  col: Column
  house: Household
  s: HouseStats | undefined
  status: MonthStatus | null
  isPaid: boolean
  payment: Payment | undefined
  month: string
  isToggling: boolean
  onToggle: ViewProps['onToggle']
}) {
  const cell = 'border-b border-r border-[var(--border)] px-3.5 py-3'
  if (col.key === 'status') {
    return (
      <td className={cell}>
        <div className="flex items-center gap-1.5">
          {status ? (
            <button
              type="button"
              onClick={() => onToggle(house, isPaid)}
              aria-pressed={isPaid}
              disabled={isToggling}
              className="cursor-pointer rounded-full transition-transform hover:scale-105 active:scale-95 disabled:cursor-wait disabled:opacity-70"
              title={`Click to toggle ${TAG_LABEL[status]}`}
            >
              {isToggling ? (
                <span className="flex size-6 items-center justify-center text-[var(--primary)]">
                  <Loader2 size={15} className="animate-spin" />
                </span>
              ) : (
                <TagPill status={status} />
              )}
            </button>
          ) : (
            <span className="text-[var(--muted)]">—</span>
          )}
          <PaymentAdjust houseId={house.id} monthKey={month} />
        </div>
        <PaymentNote payment={payment} />
      </td>
    )
  }
  if (col.key === 'score') {
    return (
      <td className={cn(cell, 'text-right')}>
        {s && (
          <span className="inline-flex items-center gap-2">
            <ScoreDots score={s.reliabilityScore} size={13} />
            <span className="font-mono text-xs">{s.reliabilityScore}</span>
          </span>
        )}
      </td>
    )
  }
  if (col.key === 'tier') {
    return <td className={cell}>{s && <TierPill tier={s.tier} />}</td>
  }
  if (col.key === 'streak') {
    return <td className={cn(cell, 'text-right font-mono text-[13px]')}>{s?.currentStreak ?? '—'}</td>
  }
  return <td className={cn(cell, 'text-right font-mono text-[13px]')}>{formatMoney(house.fee)}</td>
}

/* ---------------- Board view (AnyType ViewBoard) ---------------- */

type BucketKey = 'ontime' | 'late' | 'upcoming' | 'unpaid'

const BOARD_BUCKETS: { key: BucketKey }[] = [
  { key: 'ontime' },
  { key: 'late' },
  { key: 'upcoming' },
  { key: 'unpaid' },
]

function bucketFor(stats: ReturnType<typeof computeAllHouseStats>, house: Household, month: string): BucketKey {
  const s = statusForMonth(stats.get(house.id), month)
  return s && (s === 'ontime' || s === 'late' || s === 'unpaid') ? (s === 'ontime' ? 'ontime' : (s as BucketKey)) : 'upcoming'
}

function BoardView({ rows, stats, month, query, counts, isToggling, onToggle, onEdit, onDelete, onRemind, onAdd }: ViewProps & { counts: Record<string, number> }) {
  const [order, setOrder] = useState<Record<BucketKey, number[]>>(() => initialOrder(rows, stats, month))
  const dragFrom = useRef<BucketKey | null>(null)

  useEffect(() => {
    setOrder((prev) => reconcileOrder(prev, rows, stats, month))
  }, [rows, stats, month])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const findBucket = (id: number): BucketKey | null => {
    for (const b of BOARD_BUCKETS) if ((order[b.key] ?? []).includes(id)) return b.key
    return null
  }

  const onDragStart = (e: DragStartEvent) => {
    dragFrom.current = findBucket(e.active.id as number)
  }

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e
    if (!over) return
    const activeId = active.id as number
    const overId = over.id
    const from = findBucket(activeId)
    const to = typeof overId === 'string' ? (overId as BucketKey) : findBucket(overId as number)
    if (!from || !to) return

    if (from === to) {
      if (typeof overId === 'number' && activeId !== overId) {
        setOrder((prev) => {
          const list = prev[from] ?? []
          const fromIdx = list.indexOf(activeId)
          const toIdx = list.indexOf(overId as number)
          if (fromIdx < 0 || toIdx < 0) return prev
          return { ...prev, [from]: arrayMove(list, fromIdx, toIdx) }
        })
      }
      return
    }

    setOrder((prev) => {
      const src = (prev[from] ?? []).filter((id) => id !== activeId)
      const dst = [...(prev[to] ?? [])]
      if (typeof overId === 'number') {
        const idx = dst.indexOf(overId as number)
        if (idx >= 0) dst.splice(idx, 0, activeId)
        else dst.push(activeId)
      } else {
        dst.push(activeId)
      }
      return { ...prev, [from]: src, [to]: dst }
    })
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active } = e
    const activeId = active.id as number
    const house = rows.find((h) => h.id === activeId)
    const to = findBucket(activeId)
    const from = dragFrom.current ?? to
    if (house && from && to && from !== to) {
      const targetPaid = to === 'ontime' || to === 'late'
      const currentlyPaid = statusForMonth(stats.get(house.id), month) === 'ontime' || statusForMonth(stats.get(house.id), month) === 'late'
      if (targetPaid !== currentlyPaid) onToggle(house, currentlyPaid)
      setOrder((prev) => reconcileOrder(prev, rows, stats, month))
    }
    dragFrom.current = null
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-2 overflow-x-auto pb-2">
        {BOARD_BUCKETS.map((b) => (
          <BoardColumn
            key={b.key}
            bucket={b.key}
            count={counts[b.key] ?? 0}
            ids={order[b.key] ?? []}
            housesById={rowsById(rows)}
            stats={stats}
            month={month}
            isToggling={isToggling}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onRemind={onRemind}
          />
        ))}
        {rows.length === 0 && (
          <div className="w-full">
            <RecordsEmptyState searching={query.trim() !== ''} onAdd={query ? undefined : onAdd} />
          </div>
        )}
      </div>
    </DndContext>
  )
}

function BoardColumn({
  bucket,
  count,
  ids,
  housesById,
  stats,
  month,
  isToggling,
  onToggle,
  onEdit,
  onDelete,
  onRemind,
}: {
  bucket: BucketKey
  count: number
  ids: number[]
  housesById: Map<number, Household>
  stats: ReturnType<typeof computeAllHouseStats>
  month: string
  isToggling: ViewProps['isToggling']
  onToggle: ViewProps['onToggle']
  onEdit: ViewProps['onEdit']
  onDelete: ViewProps['onDelete']
  onRemind: ViewProps['onRemind']
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket })
  return (
    <div className="flex w-[262px] shrink-0 flex-col rounded-lg bg-[color-mix(in_srgb,var(--fg)_4%,transparent)]">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <TagPill status={bucket} />
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--border)] px-1.5 font-mono text-[11px] text-[var(--muted)]">
          {count}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 rounded-lg p-2 transition-colors',
          isOver && 'bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]',
        )}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const house = housesById.get(id)
            if (!house) return null
            return (
              <BoardCard
                key={house.id}
                house={house}
                stats={stats}
                month={month}
                isToggling={isToggling(house.id)}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onRemind={onRemind}
              />
            )
          })}
        </SortableContext>
        {ids.length === 0 && (
          <div
            className={cn(
              'flex min-h-16 items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] text-xs transition-colors',
              isOver && 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]',
            )}
          >
            {isOver ? 'Drop here' : 'Nothing here'}
          </div>
        )}
      </div>
    </div>
  )
}

function BoardCard({
  house,
  stats,
  month,
  isToggling,
  onToggle,
  onEdit,
  onDelete,
  onRemind,
}: {
  house: Household
  stats: ReturnType<typeof computeAllHouseStats>
  month: string
  isToggling: boolean
  onToggle: ViewProps['onToggle']
  onEdit: ViewProps['onEdit']
  onDelete: ViewProps['onDelete']
  onRemind: ViewProps['onRemind']
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: house.id })
  const s = stats.get(house.id)
  const status = statusForMonth(s, month)
  const isPaid = status === 'ontime' || status === 'late'
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        'group cursor-grab touch-none rounded-lg border border-[color-mix(in_srgb,var(--fg)_8%,transparent)] bg-[var(--card)] p-2.5 transition-colors active:cursor-grabbing hover:shadow-sm',
        'hover:border-[color-mix(in_srgb,var(--primary)_35%,transparent)]',
        isDragging && 'z-10 opacity-80',
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="font-mono text-xs text-[var(--primary)]">{house.houseNumber}</span>
        <RowActions
          house={house}
          isPaid={isPaid}
          isToggling={isToggling}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          onRemind={onRemind}
        />
      </div>
      <div className="mt-0.5 truncate text-sm font-medium" title={house.name}>
        {house.name}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {status ? (
            <button
              type="button"
              onClick={() => onToggle(house, isPaid)}
              aria-pressed={isPaid}
              className="cursor-pointer rounded-full transition-transform hover:scale-105 active:scale-95"
              title={`Click to toggle ${TAG_LABEL[status]}`}
            >
              <TagPill status={status} />
            </button>
          ) : (
            <span className="text-[var(--muted)]">—</span>
          )}
          <PaymentAdjust houseId={house.id} monthKey={month} />
        </div>
        <span className="font-mono text-xs text-[var(--muted)]">{formatMoney(house.fee)}</span>
      </div>
      {s && (
        <div className="mt-2 flex items-center gap-1.5">
          <ScoreDots score={s.reliabilityScore} size={12} />
          <span className="font-mono text-[11px] text-[var(--muted)]">{s.reliabilityScore}</span>
        </div>
      )}
    </div>
  )
}

function rowsById(rows: Household[]): Map<number, Household> {
  const m = new Map<number, Household>()
  for (const h of rows) m.set(h.id, h)
  return m
}

function initialOrder(rows: Household[], stats: ReturnType<typeof computeAllHouseStats>, month: string): Record<BucketKey, number[]> {
  const order: Record<BucketKey, number[]> = { ontime: [], late: [], upcoming: [], unpaid: [] }
  for (const h of rows) order[bucketFor(stats, h, month)].push(h.id)
  return order
}

function reconcileOrder(
  prev: Record<BucketKey, number[]>,
  rows: Household[],
  stats: ReturnType<typeof computeAllHouseStats>,
  month: string,
): Record<BucketKey, number[]> {
  const derived = initialOrder(rows, stats, month)
  const next = { ontime: [], late: [], upcoming: [], unpaid: [] } as Record<BucketKey, number[]>
  for (const b of BOARD_BUCKETS) {
    const newIds = derived[b.key]
    const kept = (prev[b.key] ?? []).filter((id) => newIds.includes(id))
    const added = newIds.filter((id) => !(prev[b.key] ?? []).includes(id))
    next[b.key] = [...kept, ...added]
  }
  return next
}

/* ---------------- Gallery view (AnyType ViewGallery) ---------------- */

function GalleryView({ rows, stats, month, query, paymentFor, paid, isToggling, onToggle, onEdit, onDelete, onRemind, onAdd }: ViewProps) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4">
      {rows.length === 0 ? (
        <RecordsEmptyState searching={query.trim() !== ''} onAdd={query ? undefined : onAdd} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((house) => {
            const s = stats.get(house.id)
            const status = statusForMonth(s, month)
            const isPaid = paid(house)
            const payment = paymentFor(house)
            return (
              <GalleryCard
                key={house.id}
                house={house}
                stats={s}
                status={status}
                isPaid={isPaid}
                payment={payment}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onRemind={onRemind}
                isToggling={isToggling(house.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function GalleryCard({
  house,
  stats,
  status,
  isPaid,
  payment,
  isToggling,
  onToggle,
  onEdit,
  onDelete,
  onRemind,
}: {
  house: Household
  stats: HouseStats | undefined
  status: MonthStatus | null
  isPaid: boolean
  payment: Payment | undefined
  isToggling: boolean
  onToggle: ViewProps['onToggle']
  onEdit: ViewProps['onEdit']
  onDelete: ViewProps['onDelete']
  onRemind: ViewProps['onRemind']
}) {
  return (
    <div className="group overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--fg)_8%,transparent)] bg-[var(--card)] transition-colors hover:border-[color-mix(in_srgb,var(--primary)_35%,transparent)] hover:shadow-sm">
      {/* Cover */}
      <button
        type="button"
        onClick={() => onToggle(house, isPaid)}
        aria-label={`Toggle payment for ${house.houseNumber} · ${house.name}`}
        className="relative block aspect-video w-full cursor-pointer overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${TAG_PALETTE[status ?? 'upcoming'].bg}, ${TAG_PALETTE[status ?? 'upcoming'].text}33)`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <ResidentAvatar house={house} size={64} />
        </div>
        {status && (
          <span className="absolute left-3 top-3">
            <TagPill status={status} />
          </span>
        )}
      </button>
      {/* Body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium" title={house.name}>
              {house.name}
            </div>
            <div className="mt-0.5 font-mono text-xs text-[var(--primary)]">House {house.houseNumber}</div>
          </div>
          <RowActions
            house={house}
            isPaid={isPaid}
            isToggling={isToggling}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onRemind={onRemind}
          />
        </div>
        {payment?.note && <p className="mt-2 truncate text-xs text-[var(--muted)]">{payment.note}</p>}
        <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-xs">
          <span className="font-mono text-[var(--muted)]">{formatMoney(house.fee)}</span>
          {stats && (
            <span className="flex items-center gap-1.5">
              <ScoreDots score={stats.reliabilityScore} size={12} />
              <span className="font-mono text-[11px] text-[var(--muted)]">{stats.reliabilityScore}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- List view (AnyType ViewList) ---------------- */

function ListView({ rows, stats, month, query, sort, asc, onSort, paymentFor, paid, isToggling, onToggle, onEdit, onDelete, onRemind, onAdd, visible }: ViewProps & { sort: SortKey; asc: boolean; onSort: (k: SortKey) => void; visible: Record<ColumnKey, boolean> }) {
  const listCols = COLUMNS.filter((c) => c.key !== 'tier' && (c.key === 'houseNumber' || visible[c.key]))
  const listTemplate = listCols.map((c) => COLUMN_FRACTIONS[c.key]).join(' ')
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]">
      <div className="max-h-[70vh] overflow-auto px-3 py-2">
        <div
          className="grid items-center gap-3 py-1.5 text-[12px] leading-[20px] text-[var(--muted)]"
          style={{ gridTemplateColumns: `1fr ${ACTION_W}` }}
        >
          <div className="grid gap-3" style={{ gridTemplateColumns: listTemplate }}>
            {listCols.map((c) => (
              <SortButton key={c.key} col={c} sort={sort} asc={asc} onSort={onSort} numeric={c.numeric} />
            ))}
          </div>
          <span className="sr-only">Actions</span>
        </div>
        <div className="mt-1">
          <AnimatePresence initial={false}>
            {rows.map((house) => {
              const s = stats.get(house.id)
              const status = statusForMonth(s, month)
              const isPaid = paid(house)
              const payment = paymentFor(house)
              return (
                <motion.div
                  key={house.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  className="group grid items-center gap-3 rounded-lg py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_5%,transparent)]"
                  style={{ gridTemplateColumns: `1fr ${ACTION_W}`, minHeight: 42 }}
                >
                  <button
                    type="button"
                    onClick={() => onToggle(house, isPaid)}
                    aria-label={`Toggle payment for ${house.houseNumber} · ${house.name}`}
                    className="grid min-w-0 items-center gap-3 text-left"
                    style={{ gridTemplateColumns: listTemplate }}
                  >
                    <ListRowCells listCols={listCols} house={house} s={s} status={status} payment={payment} />
                  </button>
                  <div className="flex items-center gap-1">
                    <PaymentAdjust houseId={house.id} monthKey={month} />
                    <RowActions
                      house={house}
                      isPaid={isPaid}
                      isToggling={isToggling(house.id)}
                      onToggle={onToggle}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onRemind={onRemind}
                    />
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
        {rows.length === 0 && <RecordsEmptyState searching={query.trim() !== ''} onAdd={query ? undefined : onAdd} />}
      </div>
    </div>
  )
}

function ListRowCells({
  listCols,
  house,
  s,
  status,
  payment,
}: {
  listCols: Column[]
  house: Household
  s: HouseStats | undefined
  status: MonthStatus | null
  payment: Payment | undefined
}) {
  return (
    <>
      {listCols.map((c) => {
        if (c.key === 'status') {
          return (
            <span key={c.key} className="flex flex-col items-start gap-0.5">
              {status ? <TagPill status={status} /> : <span className="text-[var(--muted)]">—</span>}
              <PaymentNote payment={payment} />
            </span>
          )
        }
        if (c.key === 'score') {
          return (
            <span key={c.key} className="flex items-center justify-end gap-1.5">
              {s && (
                <>
                  <ScoreDots score={s.reliabilityScore} size={12} />
                  <span className="font-mono text-xs">{s.reliabilityScore}</span>
                </>
              )}
            </span>
          )
        }
        if (c.key === 'streak') {
          return (
            <span key={c.key} className="text-right font-mono text-xs">
              {s?.currentStreak ?? '—'}
            </span>
          )
        }
        if (c.key === 'fee') {
          return (
            <span key={c.key} className="text-right font-mono text-sm">
              {formatMoney(house.fee)}
            </span>
          )
        }
        return (
          <span key={c.key} className="flex min-w-0 items-center gap-2.5">
            <ResidentAvatar house={house} size={24} onClick={() => useAvatarPicker.getState().open(house)} />
            <span className="min-w-0">
              <span className="block font-mono text-xs text-[var(--primary)]">{house.houseNumber}</span>
              <span className="block truncate text-sm font-medium" title={house.name}>
                {house.name}
              </span>
            </span>
          </span>
        )
      })}
    </>
  )
}

/* ---------------- Dialogs ---------------- */

function HouseFormDialog({
  house,
  open,
  defaultFee,
  onClose,
}: {
  house: Household | null
  open: boolean
  defaultFee: number
  onClose: () => void
}) {
  const mutation = useHouseMutation()
  const { play } = useSound()
  const [name, setName] = useState('')
  const [houseNumber, setHouseNumber] = useState('')
  const [fee, setFee] = useState('')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)

  useEffect(() => {
    if (open) {
      setName(house?.name ?? '')
      setHouseNumber(house?.houseNumber ?? '')
      setFee(house ? String(house.fee) : String(defaultFee || ''))
      setNotes(house?.notes ?? '')
      setActive(house?.active ?? true)
    }
  }, [open, house, defaultFee])

  const submit = () => {
    if (!name.trim() || !houseNumber.trim()) {
      toastError('Missing fields', 'Name and house number are required.')
      return
    }
    const payload: Record<string, unknown> = {
      name: name.trim(),
      house_number: houseNumber.trim(),
      fee: Math.max(0, Number(fee) || defaultFee),
      notes: notes.trim(),
    }
    if (house) {
      payload.id = house.id
      payload.active = active
    }
    mutation.mutate(payload, {
      onSuccess: () => {
        play('paid')
        toastSuccess(house ? 'House updated' : 'House added', `${houseNumber.trim()} · ${name.trim()}`)
        onClose()
      },
    })
  }

  const canSubmit = name.trim().length > 0 && houseNumber.trim().length > 0 && !mutation.isPending

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={house ? `Edit ${house.name}` : 'Add household'}
      kicker={house ? 'Household settings' : 'New resident'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {mutation.isPending ? 'Saving…' : house ? 'Save changes' : 'Add house'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">House number</label>
            <Input value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="e.g. 131" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Resident name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lensa" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Monthly fee</label>
            <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} placeholder={String(defaultFee)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        {house && (
          <label className="flex items-center gap-2 text-sm text-[var(--fg)]">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            Active household
          </label>
        )}
      </div>
    </Dialog>
  )
}

function DeleteConfirmDialog({ house, onClose }: { house: Household | null; onClose: () => void }) {
  const deleteHouse = useDeleteHouse()
  const { play } = useSound()
  if (!house) return null
  return (
    <Dialog
      open
      onClose={onClose}
      title="Delete household?"
      kicker="This cannot be undone"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={deleteHouse.isPending}
            onClick={() =>
              deleteHouse.mutate(house.id, {
                onSuccess: () => {
                  play('close')
                  toastSuccess('House deleted', `${house.houseNumber} · ${house.name}`)
                  onClose()
                },
              })
            }
          >
            {deleteHouse.isPending ? 'Deleting…' : 'Yes, delete'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--muted-fg)]">
        This permanently removes{' '}
        <span className="font-medium text-[var(--fg)]">
          {house.houseNumber} · {house.name}
        </span>{' '}
        and its payment history.
      </p>
    </Dialog>
  )
}
