'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { resolveTheme } from '@/features/theming/themes'
import { AnimatedMascot } from './AnimatedMascot'
import { useDataStore, useAllHouseStats } from '@/features/payments/dataStore'
import { dashboardStats } from '@/features/scoring/scoring'
import {
  applyEvent,
  initialState,
  moodNudge,
  tickMood,
  type MascotEvent,
  type MascotMood,
  type MascotState,
} from '@/features/mascot/engine'

/**
 * A per-theme animated mascot driven by the mascot "AI" engine: mood (valence
 * × energy) reacts to live ledger events, speech lines rotate, and the bubble
 * types with lip-sync-lite. Hovering makes it wave and perk up.
 */
export function Mascot({ size = 84, compact = false }: { size?: number; compact?: boolean }) {
  const theme = resolveTheme()
  const houses = useDataStore((s) => s.houses)
  const payments = useDataStore((s) => s.payments)
  const settings = useDataStore((s) => s.settings)

  const stats = useMemo(
    () => dashboardStats(houses, payments, settings),
    [houses, payments, settings],
  )
  const houseStats = useAllHouseStats()

  // ---- mascot AI: mood model + short-term memory ----
  const [engine, setEngine] = useState<MascotState>(initialState)
  const prevPaidRef = useRef(stats.paidCount)
  const prevScoreRef = useRef(stats.avgScore)
  const lastEventRef = useRef<number>(Date.now())

  useEffect(() => {
    const events: MascotEvent[] = []
    if (stats.paidCount > prevPaidRef.current) events.push('paid')
    if (stats.avgScore >= 80 && prevScoreRef.current < 80) events.push('leader')
    if (stats.avgScore >= 80) events.push('streak')
    if (stats.paidCount < prevPaidRef.current) events.push('unpaid')
    if (houses.length > 0 && stats.paidCount === 0) events.push('busy')
    prevPaidRef.current = stats.paidCount
    prevScoreRef.current = stats.avgScore
    if (events.length) {
      setEngine((s) => events.reduce((acc, e) => applyEvent(acc, e), s))
      lastEventRef.current = Date.now()
    }
  }, [stats.paidCount, stats.avgScore, houses.length])

  // continuous decay keeps the mascot alive (boredom rises on idle)
  useEffect(() => {
    const t = setInterval(() => {
      setEngine((s) => tickMood(s, 1))
      if (Date.now() - lastEventRef.current > 45_000) {
        setEngine((s) => applyEvent(s, 'idle'))
        lastEventRef.current = Date.now()
      }
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const mood: MascotMood = engine.mood

  const outgoing = houses.filter((h) => h.active).length - stats.paidCount
  const best = useMemo(() => {
    let top: { name: string; score: number } | null = null
    for (const h of houses) {
      const s = houseStats.get(h.id)
      if (!s) continue
      if (!top || s.reliabilityScore > top.score) top = { name: h.name, score: s.reliabilityScore }
    }
    return top
  }, [houses, houseStats])

  // static persona lines first, then live data-driven lines (prefixed with ':').
  const staticLines = theme.mascot.lines.length ? theme.mascot.lines : ['ALL QUIET ON THE LEDGER']
  const liveLines = [
    `:${outgoing} ${outgoing === 1 ? 'house' : 'houses'} still owe this month`,
    `:${stats.completionPct}% of households settled`,
    best ? `:${best.name} leads at ${best.score}/100` : `:No elected leaderboard yet`,
  ]
  const nudge = moodNudge(mood)
  const lines = [...staticLines, ...(nudge ? [`:${nudge}`] : []), ...liveLines]

  const [idx, setIdx] = useState(0)
  const [changed, setChanged] = useState(false)
  const [talking, setTalking] = useState(false)

  // rotate the line on a mood-aware cadence
  useEffect(() => {
    if (lines.length < 2) return
    const base = mood === 'excited' || mood === 'happy' ? 3200 : 4800
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % lines.length)
      setChanged(true)
    }, base)
    return () => clearInterval(t)
  }, [lines.length, mood])

  useEffect(() => {
    if (!changed) return
    const t = setTimeout(() => setChanged(false), 1200)
    return () => clearTimeout(t)
  }, [changed, idx])

  // lip-sync-lite: talk while the current line is being shown (a short "say"
  // window at the start of each change)
  useEffect(() => {
    setTalking(true)
    const t = setTimeout(() => setTalking(false), Math.min(900, (idx % lines.length) * 160 + 500))
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx])

  const current = lines[idx] ?? lines[0] ?? 'ALL QUIET ON THE LEDGER'
  const isLive = current.startsWith(':')
  const text = isLive ? current.slice(1) : current

  return (
    <div className="flex items-end gap-3">
      <div className="shrink-0">
        <AnimatedMascot
          sprite={theme.sprite}
          size={size}
          mood={mood}
          talking={talking}
          onInteract={(idleOnly) => {
            if (!idleOnly) {
              setIdx((i) => (i + 1) % lines.length)
              setChanged(true)
            }
          }}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25 }}
          className="relative rounded-md border border-[var(--border)] bg-[var(--secondary)] px-3 py-2 font-mono text-[10px] leading-snug text-[var(--muted-fg)]"
          style={{ maxWidth: compact ? 180 : 250 }}
        >
          <span className={isLive ? 'font-medium text-[var(--primary)]' : undefined}>
            {isLive && <span className="mr-1 text-[var(--accent)]">▸</span>}
            {text}
          </span>
          <span
            className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-b border-l border-[var(--border)] bg-[var(--secondary)]"
            aria-hidden="true"
          />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
