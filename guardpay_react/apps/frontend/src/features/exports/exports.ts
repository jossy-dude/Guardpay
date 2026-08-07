'use client'

import ExcelJS from 'exceljs'
import { downloadFile } from '@/lib/utils'
import type { Household, HouseStats, Payment, GuardPayment, Settings } from '@/lib/types'
import { statusForMonth } from '@/features/scoring/scoring'

export type ExportFormat = 'xlsx' | 'csv' | 'json'

export type ExportRowFilter = 'all' | 'paid' | 'unpaid'

export interface ExportRow {
  houseNumber: string
  name: string
  fee: number
  paid: string | null
  monthKey: string
  amount?: number
  note?: string
  status?: string
}

/** Build flat rows for a given month (defaults to the current month).
 *  Status is derived through the SAME shared `statusForMonth` the PDF reports
 *  use (a month is "paid" iff it resolves to ontime), so the spreadsheet and
 *  the report can never disagree about a house's standing for that month. */
export function buildExportRows(
  houses: Household[],
  payments: Payment[],
  monthKey: string,
  opts: { includeNotes?: boolean; filter?: ExportRowFilter } = {},
  stats?: Map<number, HouseStats>,
): ExportRow[] {
  const { includeNotes = true, filter = 'all' } = opts
  const rows = houses
    .filter((h) => h.active)
    .map((h) => {
      const p = payments.find((x) => x.houseId === h.id && x.monthKey === monthKey)
      const derived = stats ? statusForMonth(stats.get(h.id), monthKey) : null
      const paid = derived !== null ? derived === 'ontime' : !!p?.paidDate
      return {
        houseNumber: h.houseNumber,
        name: h.name,
        fee: h.fee,
        paid: p?.paidDate ?? null,
        monthKey,
        amount: p ? p.amount : 0,
        note: includeNotes ? (p?.note ?? '') : '',
        status: paid ? 'paid' : 'unpaid',
      }
    })
  if (filter === 'paid') return rows.filter((r) => r.paid)
  if (filter === 'unpaid') return rows.filter((r) => !r.paid)
  return rows
}

/** Build one row per household per month across an inclusive month range. */
export function buildExportRangeRows(
  houses: Household[],
  payments: Payment[],
  fromMonth: string,
  toMonth: string,
  opts: { includeNotes?: boolean; filter?: ExportRowFilter } = {},
  stats?: Map<number, HouseStats>,
): ExportRow[] {
  const months: string[] = []
  let m = fromMonth
  while (m <= toMonth) {
    months.push(m)
    m = addMonthKey(m)
  }
  return months.flatMap((mk) => buildExportRows(houses, payments, mk, opts, stats))
}

function addMonthKey(mk: string): string {
  const [y, mo] = mk.split('-').map(Number)
  const d = new Date(y!, mo! - 1, 1)
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Columns with our preferred headers, in order. */
const COLUMNS: { key: keyof ExportRow; header: string }[] = [
  { key: 'houseNumber', header: 'House #' },
  { key: 'name', header: 'Resident' },
  { key: 'fee', header: 'Fee' },
  { key: 'paid', header: 'Paid Date' },
  { key: 'amount', header: 'Amount' },
  { key: 'status', header: 'Status' },
  { key: 'note', header: 'Note' },
  { key: 'monthKey', header: 'Month' },
]

/** Column subset to actually emit (drops empty note column when disabled). */
function columnsFor(opts: { includeNotes?: boolean }): typeof COLUMNS {
  return opts.includeNotes === false ? COLUMNS.filter((c) => c.key !== 'note') : COLUMNS
}

export function exportCSV(rows: ExportRow[], _settings: Settings, filename: string, opts: { includeNotes?: boolean } = {}) {
  const cols = columnsFor(opts)
  const esc = (v: string) => (v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v)
  const header = cols.map((c) => esc(c.header)).join(',')
  const lines = rows.map((r) =>
    cols.map((c) => esc(String(r[c.key] ?? ''))).join(','),
  )
  // \uFEFF = UTF-8 BOM so Excel opens the CSV correctly.
  const csv = `\uFEFF${header}\n${lines.join('\n')}`
  downloadFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename)
}

export async function exportXLSX(rows: ExportRow[], settings: Settings, filename: string, opts: { includeNotes?: boolean } = {}) {
  const cols = columnsFor(opts)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GuardPay'
  const sheet = workbook.addWorksheet('Payments')

  // Row 1 = title, Row 2 = headers, then data. Build explicitly to avoid the
  // empty-first-row trap ExcelJS creates when mixing addRow + columns.
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = settings.neighborhoodName
  titleCell.font = { bold: true, size: 14 }

  cols.forEach((c, idx) => {
    const cell = sheet.getCell(2, idx + 1)
    cell.value = c.header
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } }
    sheet.getColumn(idx + 1).width = c.key === 'note' ? 32 : 18
  })

  rows.forEach((r, ri) => {
    cols.forEach((c, idx) => {
      sheet.getCell(ri + 3, idx + 1).value = r[c.key] ?? ''
    })
  })

  sheet.views = [{ state: 'frozen', ySplit: 2 }]
  const buffer = await workbook.xlsx.writeBuffer()
  downloadFile(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
}

export function exportJSON(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadFile(blob, filename)
}

export function buildJsonBackup(
  houses: Household[],
  payments: Payment[],
  guardPayments: GuardPayment[],
  settings: Settings,
) {
  return {
    format: 'guardpay-v2',
    exportedAt: new Date().toISOString(),
    settings,
    houses: houses.map((h) => ({
      house_number: h.houseNumber,
      name: h.name,
      fee: h.fee,
      notes: h.notes,
      active: h.active,
      created_month: h.createdMonth,
    })),
    payments: payments.map((p) => ({
      house_number: houses.find((h) => h.id === p.houseId)?.houseNumber ?? String(p.houseId),
      month_key: p.monthKey,
      paid_date: p.paidDate,
      amount: p.amount,
      note: p.note,
    })),
    guard_payments: guardPayments.map((g) => ({
      month_key: g.monthKey,
      paid_date: g.paidDate,
      amount: g.amount,
      method: g.method,
      note: g.note,
    })),
  }
}

/** Default filenames scoped to month + timestamp. */
export function stampName(base: string, ext: string): string {
  const ts = new Date().toISOString().slice(0, 10)
  return `${base}-${ts}.${ext}`
}