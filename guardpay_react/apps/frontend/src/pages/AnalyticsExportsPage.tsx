'use client'

import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts'
import { FileJson, FileSpreadsheet, FileText } from 'lucide-react'
import { useDataStore, useAllHouseStats } from '@/features/payments/dataStore'
import { Layout, Section, SectionHead } from '@/components/layout/Layout'
import { CountUp } from '@/components/shared/animations'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toastError } from '@/components/toast/store'
import { cn } from '@/lib/cn'
import { formatMoney, addMonths, calendarMonthLabel, calendarMonthShort, currentMonthKey } from '@/lib/utils'
import {
  buildExportRows,
  buildExportRangeRows,
  buildJsonBackup,
  exportCSV,
  exportJSON,
  exportXLSX,
  stampName,
  type ExportRowFilter,
} from '@/features/exports/exports'
import { buildReportData } from '@/features/exports/reports'
import type { ReportTemplate } from '@/features/exports/reports'
import { PaperPreview, ReportTemplatePicker } from '@/components/exports/PaperPreview'

const MONTHS = 12

export function AnalyticsExportsPage() {
  const houses = useDataStore((s) => s.houses)
  const payments = useDataStore((s) => s.payments)
  const guardPayments = useDataStore((s) => s.guardPayments)
  const settings = useDataStore((s) => s.settings)
  const allStats = useAllHouseStats()
  const [yearOffset, setYearOffset] = useState(0)
  const [template, setTemplate] = useState<ReportTemplate>('monthly')
  const [busy, setBusy] = useState<string | null>(null)

  // Sheet export options
  const [sheetMode, setSheetMode] = useState<'month' | 'range'>('month')
  const [sheetMonth, setSheetMonth] = useState(currentMonthKey())
  const [rangeFrom, setRangeFrom] = useState(addMonths(currentMonthKey(), -1))
  const [rangeTo, setRangeTo] = useState(currentMonthKey())
  const [sheetFilter, setSheetFilter] = useState<ExportRowFilter>('all')
  const [sheetNotes, setSheetNotes] = useState(true)

  // PDF report options
  const [reportMonth, setReportMonth] = useState(currentMonthKey())
  const [reportYear, setReportYear] = useState(new Date().getFullYear())
  const [reportTitle, setReportTitle] = useState('')
  const [reportSubtitle, setReportSubtitle] = useState('')
  const [pageSize, setPageSize] = useState<'a4' | 'a5'>('a4')
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait')

  const year = new Date().getFullYear() - yearOffset
  const month = currentMonthKey()

  const sheetRows = useMemo(() => {
    const opts = { includeNotes: sheetNotes, filter: sheetFilter }
    if (sheetMode === 'range') return buildExportRangeRows(houses, payments, rangeFrom, rangeTo, opts, allStats)
    return buildExportRows(houses, payments, sheetMonth, opts, allStats)
  }, [houses, payments, sheetMode, sheetMonth, rangeFrom, rangeTo, sheetFilter, sheetNotes, allStats])

  const rows = useMemo(() => buildExportRows(houses, payments, month, {}, allStats), [houses, payments, month, allStats])
  const data = useMemo(
    () => buildReportData(houses, payments, guardPayments, settings, { monthKey: reportMonth, year: reportYear }),
    [houses, payments, guardPayments, settings, reportMonth, reportYear],
  )

  const { monthly, onTimeSeries, annualSummary } = useMemo(() => {
    const now = new Date()
    const months: string[] = []
    const cur = `${now.getFullYear() - yearOffset}-${String(now.getMonth() + 1).padStart(2, '0')}`
    let m = addMonths(cur, -(MONTHS - 1))
    for (let i = 0; i < MONTHS; i++) {
      months.push(m)
      m = addMonths(m, 1)
    }
    const active = houses.filter((h) => h.active)
    const byMonth = new Map<string, { collected: number; expected: number; paid: number; total: number; onTime: number }>()
    for (const mk of months) {
      byMonth.set(mk, { collected: 0, expected: 0, paid: 0, total: active.length, onTime: 0 })
    }
    for (const h of active) {
      const pay = payments.filter((p) => p.houseId === h.id)
      for (const p of pay) {
        const bucket = byMonth.get(p.monthKey)
        if (!bucket) continue
        bucket.collected += p.amount || h.fee
        bucket.paid++
      }
      // expected per month the house has existed
      for (const mk of months) {
        const bucket = byMonth.get(mk)
        if (bucket && mk >= h.createdMonth) bucket.expected += h.fee
      }
    }

    const monthly = months.map((mk) => {
      const b = byMonth.get(mk)!
      return {
        month: mk,
        collected: b.collected,
        expected: b.expected,
        pct: b.expected ? Math.round((b.collected / b.expected) * 100) : 0,
        paid: b.paid,
        total: b.total,
      }
    })

    const onTimeSeries = months.map((mk) => {
      let resolved = 0
      let onTime = 0
      for (const h of active) {
        const st = allStats.get(h.id)
        const entry = st?.history.find((e) => e.monthKey === mk)
        if (entry && entry.status !== 'upcoming') {
          resolved++
          if (entry.status === 'ontime') onTime++
        }
      }
      return {
        month: mk,
        rate: resolved ? Math.round((onTime / resolved) * 100) : 0,
        resolved,
      }
    })

    return {
      monthly,
      onTimeSeries,
      annualSummary: {
        collected: monthly.reduce((a, b) => a + b.collected, 0),
        expected: monthly.reduce((a, b) => a + b.expected, 0),
        onTimeAvg: onTimeSeries.length
          ? Math.round(onTimeSeries.reduce((a, b) => a + b.rate, 0) / onTimeSeries.length)
          : 0,
      },
    }
  }, [houses, payments, yearOffset, allStats])

  const paid = rows.filter((r) => r.paid).length
  const expected = rows.reduce((a, r) => a + r.fee, 0)
  const collected = rows.filter((r) => r.paid).reduce((a, r) => a + r.fee, 0)

  const run = async (key: string, fn: () => void | Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      toastError('Export failed', err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Layout>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHead title="Analytics & Export" kicker="Cash flow, reliability & backups" />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYearOffset((y) => y + 1)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--border)]"
            aria-label="Previous year"
          >
            ‹
          </button>
          <span className="font-display text-lg font-semibold">{year}</span>
          <button
            onClick={() => setYearOffset((y) => Math.max(0, y - 1))}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--border)]"
            aria-label="Next year"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="Collected (12 mo)" value={annualSummary.collected} />
        <SummaryCard label="Expected (12 mo)" value={annualSummary.expected} />
        <SummaryCard label="Avg on-time rate" value={annualSummary.onTimeAvg} suffix="%" />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Houses" value={rows.length} />
        <Stat label="Paid" value={paid} />
        <Stat label="Collected" value={collected.toLocaleString()} currency={settings.currency} />
        <Stat label="Expected" value={expected.toLocaleString()} currency={settings.currency} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section data-surface="keep-rect">
          <SectionHead title="Monthly Collection" kicker="Collected vs expected" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={(m) => calendarMonthShort(m, settings)} stroke="var(--muted)" />
                <YAxis stroke="var(--muted)" tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip
                  formatter={(value, name) => [formatMoney(Number(value), settings.currency), String(name)]}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Legend />
                <Bar dataKey="collected" fill="var(--success)" name="Collected" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expected" fill="var(--border)" name="Expected" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section data-surface="keep-rect">
          <SectionHead title="On-Time Payment Rate" kicker="Reliability trend" />
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={onTimeSeries}>
                <defs>
                  <linearGradient id="ontimeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tickFormatter={(m) => calendarMonthShort(m, settings)} stroke="var(--muted)" />
                <YAxis stroke="var(--muted)" domain={[0, 100]} />
                <Tooltip
                  formatter={(value) => [`${Number(value)}%`, 'On-time rate']}
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Area type="monotone" dataKey="rate" stroke="var(--primary)" fill="url(#ontimeGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section>
          <SectionHead title="Spreadsheet" kicker={`${sheetRows.length} rows · customizable`} />
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['month', 'range'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSheetMode(m)}
                  className={cn(
                    'rounded-lg border px-2 py-1.5 text-xs font-medium capitalize transition',
                    sheetMode === m
                      ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]'
                      : 'border-[var(--border)] hover:border-[var(--primary)]/50',
                  )}
                >
                  {m === 'month' ? 'Single month' : 'Date range'}
                </button>
              ))}
            </div>
            {sheetMode === 'month' ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--muted)]">Month</span>
                <MonthSelect value={sheetMonth} onChange={setSheetMonth} />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--muted)]">From → To</span>
                <div className="flex items-center gap-1.5">
                  <MonthSelect value={rangeFrom} onChange={setRangeFrom} />
                  <span className="text-[var(--muted)]">→</span>
                  <MonthSelect value={rangeTo} onChange={setRangeTo} monthsBack={12} />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--muted)]">Include</span>
              <select
                value={sheetFilter}
                onChange={(e) => setSheetFilter(e.target.value as ExportRowFilter)}
                className={selectCls}
              >
                <option value="all">All households</option>
                <option value="paid">Paid only</option>
                <option value="unpaid">Unpaid only</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--fg)]">
              <input
                type="checkbox"
                checked={sheetNotes}
                onChange={(e) => setSheetNotes(e.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              Include payment notes column
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() => run('xlsx', () => exportXLSX(sheetRows, settings, stampName('guardpay-ledger', 'xlsx'), { includeNotes: sheetNotes }))}
              >
                <FileSpreadsheet size={16} /> {busy === 'xlsx' ? 'Exporting…' : 'XLSX'}
              </Button>
              <Button
                variant="secondary"
                disabled={!!busy}
                onClick={() => run('csv', () => exportCSV(sheetRows, settings, stampName('guardpay-ledger', 'csv'), { includeNotes: sheetNotes }))}
              >
                <FileText size={16} /> {busy === 'csv' ? 'Exporting…' : 'CSV'}
              </Button>
            </div>
          </div>
        </Section>

        <Section>
          <SectionHead title="Export summary" kicker="JSON — summary only" />
          <Button
            className="w-full justify-start"
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              run('json', () => exportJSON(buildJsonBackup(houses, payments, guardPayments, settings), stampName('guardpay-summary', 'json')))
            }
          >
            <FileJson size={16} /> Download summary (JSON)
          </Button>
          <p className="mt-3 text-xs text-[var(--muted)]">
            A JSON summary of households, payments and guard payments for reading/sharing — it omits ids, aliases,
            fee history, reminders and is not a restorable backup.
          </p>
          <div className="mt-2 rounded-md border border-[var(--border)] p-2.5 text-xs text-[var(--muted)]">
            To snapshot or restore the live database, use the backups on the{' '}
            <a href="#/data" className="font-medium text-[var(--primary)]">
              Data page
            </a>
            .
          </div>
        </Section>
      </div>

      <Section>
        <SectionHead title="Report studio" kicker="5 templates · live preview" />
        <ReportTemplatePicker value={template} onChange={setTemplate} />
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-[var(--radius)] border border-[var(--border)] p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="mb-1 text-xs font-medium text-[var(--muted)]">Report month</div>
            <MonthSelect value={reportMonth} onChange={setReportMonth} />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-[var(--muted)]">Year</div>
            <select value={reportYear} onChange={(e) => setReportYear(Number(e.target.value))} className={selectCls}>
              {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-[var(--muted)]">Page size</div>
            <div className="flex gap-1 rounded-lg border border-[var(--border)] p-0.5">
              {(['a4', 'a5'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setPageSize(s)}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1 text-xs font-medium uppercase transition',
                    pageSize === s ? 'bg-[var(--primary)] text-[var(--primary-fg)]' : 'text-[var(--muted)]',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-[var(--muted)]">Orientation</div>
            <div className="flex gap-1 rounded-lg border border-[var(--border)] p-0.5">
              {(['portrait', 'landscape'] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setOrientation(o)}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1 text-xs font-medium transition',
                    orientation === o ? 'bg-[var(--primary)] text-[var(--primary-fg)]' : 'text-[var(--muted)]',
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Edit the report title and subtitle in the toolbar, zoom into the live preview, then download a crisp{' '}
          {pageSize.toUpperCase()} {orientation} PDF.
        </p>
        <PaperPreview
          className="mt-3"
          template={template}
          data={data}
          withToolbar
          pdfOptions={{ pageSize, orientation }}
          title={reportTitle}
          subtitle={reportSubtitle}
          onTitleChange={setReportTitle}
          onSubtitleChange={setReportSubtitle}
        />
      </Section>
    </Layout>
  )
}

function SummaryCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <Card data-surface="keep-rect" className="p-4">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-xl font-bold">
        <CountUp value={value} formatter={(n) => `${n.toLocaleString()}${suffix ?? ''}`} />
      </div>
    </Card>
  )
}

function Stat({ label, value, currency }: { label: string; value: string | number; currency?: string }) {
  return (
    <div data-surface="keep-rect" className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="text-xl font-bold">
        {typeof value === 'number' && currency && (
          <span className="mr-1 text-sm opacity-70">{currency}</span>
        )}
        {String(value)}
      </div>
    </div>
  )
}

const selectCls =
  'h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-sm text-[var(--fg)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]'

function MonthSelect({
  value,
  onChange,
  monthsBack = 36,
}: {
  value: string
  onChange: (m: string) => void
  monthsBack?: number
}) {
  const settings = useDataStore((s) => s.settings)
  const opts = useMemo(() => {
    const arr: string[] = []
    for (let i = 0; i < monthsBack; i++) arr.push(addMonths(currentMonthKey(), -i))
    return arr
  }, [monthsBack])
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls} aria-label="Select month">
      {opts.map((m) => (
        <option key={m} value={m}>
          {calendarMonthLabel(m, settings)}
          {m === currentMonthKey() ? ' (now)' : ''}
        </option>
      ))}
    </select>
  )
}

export default AnalyticsExportsPage
