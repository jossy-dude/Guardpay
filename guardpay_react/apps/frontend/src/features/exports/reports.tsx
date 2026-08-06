'use client'

import type { GuardPayment, Household, HouseStats, Payment, Settings } from '@/lib/types'
import { currentMonthKey, formatNumber, calendarMonthLabel, calendarMonthShort } from '@/lib/utils'
import { ETHIOPIAN_MONTHS_AM, ETHIOPIAN_MONTHS_EN, gregorianToEthiopian } from '@/lib/calendar'
import { computeHouseStats } from '@/features/scoring/scoring'

export type ReportTemplate = 'monthly' | 'guard' | 'scorecard' | 'outstanding' | 'annual'

export const REPORT_TEMPLATES: { id: ReportTemplate; name: string; desc: string }[] = [
  { id: 'monthly', name: 'Monthly Ledger', desc: 'All households, one month.' },
  { id: 'guard', name: 'Guard Fund', desc: 'Income · salary · surplus.' },
  { id: 'scorecard', name: 'Scorecard', desc: 'Ranked reliability cards.' },
  { id: 'outstanding', name: 'Outstanding', desc: 'Reminder sheet of overdue.' },
  { id: 'annual', name: 'Annual Review', desc: 'Full-year collection trend.' },
]

export interface ReportRow {
  houseNumber: string
  name: string
  fee: number
  status: 'ontime' | 'unpaid' | 'upcoming' | 'partial'
  paidDate: string | null
  amount: number
  score: number
  currentStreak: number
  longestStreak: number
  onTimeRate: number
}

export interface ReportData {
  settings: Settings
  monthKey: string
  monthLabel: string
  currency: string
  guardSalary: number
  houses: ReportRow[]
  summary: {
    collected: number
    expected: number
    outstanding: number
    pct: number
    paidCount: number
    total: number
  }
  guard: {
    name: string
    salary: number
    collected: number
    surplus: number
    payment: { date: string; method: string; amount: number; note: string } | null
  }
  leaderboard: { house: string; name: string; score: number; streak: number }[]
  overdue: { house: string; name: string; fee: number }[]
  annual: {
    year: number
    months: { mk: string; label: string; short: string; collected: number; expected: number }[]
    totalCollected: number
    totalExpected: number
    completion: number
    guardYearTotal: number
    households: { house: string; name: string; fee: number; paidTotal: number; monthsActive: number; score: number }[]
  }
  generated: string
}

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fmtMoney = (n: number, cur: string) => `${formatNumber(n)} ${cur}`
const pdfFmtDate = (iso: string | null, eth: boolean, am: boolean) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  if (!eth) return d.toLocaleDateString('en', { day: 'numeric', month: 'short' })
  const e = gregorianToEthiopian(d.getFullYear(), d.getMonth() + 1, d.getDate())
  const month = am ? ETHIOPIAN_MONTHS_AM[e.month - 1] : ETHIOPIAN_MONTHS_EN[e.month - 1]
  return `${e.day} ${month}`
}

export function buildReportData(
  houses: Household[],
  payments: Payment[],
  guardPayments: GuardPayment[],
  settings: Settings,
  opts: { monthKey?: string; year?: number } = {},
): ReportData {
  const year = opts.year ?? new Date().getFullYear()
  const currency = settings.currency || 'ETB'
  const monthKey = opts.monthKey ?? currentMonthKey()
  const monthLabel = calendarMonthLabel(monthKey, settings)
  const guardSalary = settings.guardSalary || 0

  const active = houses.filter((h) => h.active)

  const statsByHouse = new Map<number, HouseStats>()
  for (const h of active) {
    statsByHouse.set(h.id, computeHouseStats(h, payments, settings))
  }

  const rows: ReportRow[] = active.map((h) => {
    const stats = statsByHouse.get(h.id)!
    const cur = stats.history.find((e) => e.monthKey === monthKey) ?? stats.history[stats.history.length - 1]
    const isPaid = cur && cur.status === 'ontime'
    const amount = cur && cur.amount ? cur.amount : isPaid ? h.fee : 0
    return {
      houseNumber: h.houseNumber,
      name: h.name,
      fee: h.fee,
      status: cur ? cur.status : 'upcoming',
      paidDate: cur ? cur.paidDate : null,
      amount,
      score: stats.reliabilityScore,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      onTimeRate: stats.onTimeRate,
    }
  })

  let collected = 0
  let expected = 0
  let paidCount = 0
  rows.forEach((h) => {
    expected += Number(h.fee) || 0
    if (h.status === 'ontime') {
      paidCount++
      collected += Number(h.amount) || 0
    }
  })
  const outstanding = expected - collected
  const pct = rows.length ? Math.round((paidCount / rows.length) * 100) : 0

  const gp = guardPayments.find((g) => g.monthKey === monthKey) || null
  const guard = {
    name: settings.guardName || 'Neighborhood Guard',
    salary: guardSalary,
    collected,
    surplus: collected - guardSalary,
    payment: gp ? { date: gp.paidDate, method: gp.method, amount: gp.amount, note: gp.note } : null,
  }

  const leaderboard = active
    .map((h) => {
      const s = statsByHouse.get(h.id)!
      return { house: h.houseNumber, name: h.name, score: s.reliabilityScore, streak: s.currentStreak }
    })
    .sort((a, b) => b.streak - a.streak || b.score - a.score)
    .slice(0, 10)

  const overdue = rows
    .filter((h) => h.status === 'unpaid')
    .map((h) => ({ house: h.houseNumber, name: h.name, fee: h.fee }))
    .sort((a, b) => Number(a.house) - Number(b.house))

  const months = Array.from({ length: 12 }, (_, i) => {
    const mk = `${year}-${String(i + 1).padStart(2, '0')}`
    let mc = 0
    let me = 0
    active.forEach((h) => {
      me += h.fee
      const stats = statsByHouse.get(h.id)!
      const entry = stats.history.find((x) => x.monthKey === mk)
      if (entry && entry.status === 'ontime') mc += entry.amount ?? h.fee
    })
    return { mk, label: calendarMonthLabel(mk, settings), short: calendarMonthShort(mk, settings), collected: mc, expected: me }
  })
  const totalCollected = months.reduce((s, m) => s + m.collected, 0)
  const totalExpected = months.reduce((s, m) => s + m.expected, 0)
  const completion = totalExpected ? Math.round((totalCollected / totalExpected) * 100) : 0

  const guardYearTotal = guardPayments
    .filter((g) => g.monthKey && g.monthKey.startsWith(String(year)))
    .reduce((s, g) => s + (Number(g.amount) || 0), 0)

  const annualHouseholds = active.map((h) => {
    const stats = statsByHouse.get(h.id)!
    const paidTotal = stats.resolved
      .filter((e) => e.status === 'ontime')
      .reduce((sum, e) => sum + (e.amount ?? h.fee), 0)
    return {
      house: h.houseNumber,
      name: h.name,
      fee: h.fee,
      paidTotal,
      monthsActive: stats.resolved.length,
      score: stats.reliabilityScore,
    }
  })

  return {
    settings,
    monthKey,
    monthLabel,
    currency,
    guardSalary,
    houses: rows,
    summary: { collected, expected, outstanding, pct, paidCount, total: rows.length },
    guard,
    leaderboard,
    overdue,
    annual: {
      year,
      months,
      totalCollected,
      totalExpected,
      completion,
      guardYearTotal,
      households: annualHouseholds,
    },
    generated: new Date().toLocaleString(),
  }
}

const docHead = (title: string, sub: string) =>
  `<div class="doc-head"><div class="t">${title}</div><div class="sub">${sub}</div></div>`

const foot = (left: string, right: string) =>
  `<div class="foot"><span>${left}</span><span>${right}</span></div>`

const metaItem = (label: string, value: string, tone = '') =>
  `<div class="m"><div class="l">${label}</div><div class="v ${tone}">${value}</div></div>`

export function renderReport(
  t: ReportTemplate,
  d: ReportData,
  opts: { title?: string; subtitle?: string } = {},
): string {
  const cur = escapeHtml(d.currency || 'ETB')
  const nm = d.settings.neighborhoodName || 'GuardPay Community'
  const s = d.summary
  const head = (title: string, sub: string) =>
    docHead(opts.title?.trim() || title, opts.subtitle?.trim() || sub)

  switch (t) {
    case 'monthly': {
      const rows = d.houses
        .map((h) => {
            const isPaid = h.status === 'ontime'
          return `<tr><td class="r num">#${escapeHtml(h.houseNumber)}</td><td>${escapeHtml(h.name)}</td>` +
            `<td class="r num">${fmtMoney(h.fee, cur)}</td><td class="r">${pdfFmtDate(h.paidDate, d.settings.calendarMode === 'ethiopian', d.settings.monthLanguage === 'amharic')}</td>` +
            `<td><span class="pill ${isPaid ? 'paid' : 'unpaid'}">${isPaid ? 'Paid' : 'Unpaid'}</span></td></tr>`
        })
        .join('')
      return head('Monthly Collection Ledger', `${escapeHtml(nm)}<br>${d.monthLabel}<br>Generated ${d.generated}`) +
        `<div class="doc-meta">${metaItem('Collected', fmtMoney(s.collected, cur), 'green')}` +
        `${metaItem('Outstanding', fmtMoney(s.outstanding, cur), 'danger')}` +
        `${metaItem('Completion', `${s.pct}%`)}</div>` +
        `<h4>All Households · ${s.total}</h4>` +
        `<table><thead><tr><th class="r">House</th><th>Resident</th><th class="r">${cur}</th><th class="r">Paid</th><th>Status</th></tr></thead>` +
        `<tbody>${rows || `<tr><td colspan="5" style="color:#7b8794;font-style:italic">No households to report.</td></tr>`}</tbody></table>` +
        foot(`Monthly ledger · ${d.monthLabel}`, 'Page 1')
    }

    case 'guard': {
      const g = d.guard
      return head('Guard Fund In &amp; Out', 'Guard Fund In &amp; Out<br>' + d.monthLabel) +
        `<div class="doc-meta">${metaItem('Collected', fmtMoney(g.collected, cur), 'green')}` +
        `${metaItem('Guard Salary', fmtMoney(g.salary, cur), 'accent')}` +
        `${metaItem('Surplus', fmtMoney(g.surplus, cur), g.surplus >= 0 ? 'green' : 'danger')}</div>` +
        `<h4>Fund Movement</h4>` +
        `<div class="sett">` +
        `<div class="r"><span>Opening balance</span><span class="v">${fmtMoney(0, cur)}</span></div>` +
        `<div class="r"><span>Collected from ${s.paidCount} households</span><span class="v">+${fmtMoney(g.collected, cur)}</span></div>` +
        `<div class="r"><span>Guard salary (${fmtMoney(g.salary, cur)})</span><span class="v">−${fmtMoney(g.salary, cur)}</span></div>` +
        `<div class="r"><span>Outstanding from ${s.total - s.paidCount} households</span><span class="v">${fmtMoney(s.outstanding, cur)}</span></div>` +
        `<div class="r tot"><span>Closing balance</span><span class="v">${fmtMoney(g.surplus, cur)}</span></div>` +
        `</div>` +
        `<div class="sign-line">Received by: <span class="line"></span>  Date: <span class="line"></span></div>` +
        foot(`Monthly ledger · ${d.monthLabel}`, 'Guard fund settlement')
    }

    case 'scorecard': {
      const ranked = d.houses.slice().sort((a, b) => b.score - a.score)
      const cards = ranked
        .map(
          (h, i) => {
          const isPaid = h.status === 'ontime'
            return `<div class="sc-card"><div class="nm">${escapeHtml(h.name)}</div>` +
              `<div class="ho">#${escapeHtml(h.houseNumber)} · ${isPaid ? 'Paid' : 'Unpaid'}</div>` +
              `<div class="sc">Rank ${i + 1}</div></div>`
          },
        )
        .join('')
      const top = ranked[0]
      return head('Reliability Scorecard', `Ranking<br>${d.monthLabel}<br>${s.total} households ranked`) +
        `<p class="lead">${top ? `Leading this month: <b>${escapeHtml(top.name)}</b> (house #${escapeHtml(top.houseNumber)}) with a score of <b>${top.score}</b> and a <b>${top.currentStreak} month</b> on-time streak.` : 'No households to rank yet.'}</p>` +
        `<div class="grid4">${cards}</div>` +
        foot(`Monthly ledger · ${d.monthLabel}`, 'Reliability scorecard')
    }

    case 'outstanding': {
      const rows = d.overdue
        .map(
          (o) =>
            `<tr><td class="r num">#${escapeHtml(o.house)}</td><td>${escapeHtml(o.name)}</td>` +
            `<td class="r num">${fmtMoney(o.fee, cur)}</td><td><span class="pill unpaid">Unpaid</span></td></tr>`,
        )
        .join('')
      return head('Outstanding Reminders', `Payment Reminder Sheet<br>${d.monthLabel}<br>${d.overdue.length} pending`) +
        `<p class="lead">This is a friendly reminder that your monthly neighborhood contribution of <b>${fmtMoney(s.expected / Math.max(s.total, 1), cur)}</b>${s.total ? '' : ''} is still outstanding. Kindly settle at your earliest convenience.</p>` +
        `<h4>Pending Households</h4>` +
        `<table><thead><tr><th class="r">House</th><th>Resident</th><th class="r">${cur}</th><th>Status</th></tr></thead>` +
        `<tbody>${rows || `<tr><td colspan="4" style="color:#7b8794;font-style:italic">All households are current — nothing pending.</td></tr>`}</tbody></table>` +
        `<div class="doc-meta" style="margin-top:18px">${metaItem('Total Outstanding', fmtMoney(s.outstanding, cur), 'danger')}</div>` +
        foot(`Monthly ledger · ${d.monthLabel}`, 'Friendly reminder sheet')
    }

    case 'annual': {
      const a = d.annual
      const maxC = Math.max(...a.months.map((x) => x.collected), 1)
      const bars = a.months
        .map((m) => {
          const h = Math.max(4, Math.round((m.collected / maxC) * 100))
          const isCur = m.mk === currentMonthKey()
          return `<div class="b${isCur ? ' cur' : ''}" style="height:${h}%" title="${escapeHtml(m.label)}: ${fmtMoney(m.collected, cur)}">` +
            `<b class="val">${Math.round(m.collected / 1000)}k</b><span>${m.short}</span></div>`
        })
        .join('')
      const thisMonth = a.months.find((m) => m.mk === currentMonthKey())?.collected ?? 0
      return head('Annual Collection Review', `Full-year review · ${a.year}`) +
        `<div class="doc-meta">${metaItem('This Month', fmtMoney(thisMonth, cur), 'green')}` +
        `${metaItem('Completion', `${a.completion}%`)}` +
        `${metaItem('Guard Salary', fmtMoney(d.guardSalary, cur), 'accent')}</div>` +
        `<h4>Monthly Collections (${cur})</h4>` +
        `<div class="trend">${bars}</div>` +
        `<p class="lead" style="margin-top:22px">Across ${a.year}, the neighborhood collected <b>${fmtMoney(a.totalCollected, cur)}</b> of ${fmtMoney(a.totalExpected, cur)} expected — a <b>${a.completion}%</b> completion rate.</p>` +
        foot(`Monthly ledger · ${a.year}`, 'Annual collection review')
    }
  }
}