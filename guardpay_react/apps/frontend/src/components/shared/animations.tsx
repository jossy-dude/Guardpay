'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Animates a number from its previous value to the new value using
 * requestAnimationFrame with easing. Respects prefers-reduced-motion.
 */
export function CountUp({
  value,
  duration = 900,
  formatter,
  className,
}: {
  value: number
  duration?: number
  formatter?: (n: number) => string
  className?: string
}) {
  const [display, setDisplay] = useState(0)
  const [prev, setPrev] = useState(value)
  const raf = useRef<number>(0)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      setDisplay(value)
      setPrev(value)
      return
    }
    const start = prev
    const end = value
    if (start === end) return
    const startTime = performance.now()
    const step = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(start + (end - start) * eased)
      if (t < 1) raf.current = requestAnimationFrame(step)
      else {
        setDisplay(end)
        setPrev(end)
      }
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [value, duration, prev])

  const shown = Math.round(display)
  return <span className={className}>{formatter ? formatter(shown) : shown.toLocaleString()}</span>
}

/** 5-dot score indicator (filled / half / empty) driven by a 0-100 score. */
export function ScoreDots({ score, size = 18 }: { score: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, score))
  const full = Math.floor(clamped / 20)
  const half = clamped % 20 >= 10 ? 1 : 0
  const dots = Array.from({ length: 5 })
  return (
    <span className="inline-flex gap-1" aria-label={`Score ${Math.round(clamped)} of 100`}>
      {dots.map((_, i) => {
        const state = i < full ? 'full' : i === full && half ? 'half' : 'empty'
        return (
          <span
            key={i}
            style={{
              width: size,
              height: size,
              background:
                state === 'full'
                  ? 'var(--primary)'
                  : state === 'half'
                    ? `linear-gradient(90deg, var(--primary) 50%, var(--border) 50%)`
                    : 'var(--border)',
              borderRadius: '99px',
            }}
          />
        )
      })}
    </span>
  )
}

/** Reliability tier badge. */
export function TierBadge({ tier }: { tier: 'excellent' | 'reliable' | 'inconsistent' | 'at_risk' }) {
  const label =
    tier === 'excellent'
      ? 'Excellent'
      : tier === 'reliable'
        ? 'Reliable'
        : tier === 'inconsistent'
          ? 'Inconsistent'
          : 'At Risk'
  const color =
    tier === 'excellent'
      ? 'var(--success)'
      : tier === 'reliable'
        ? 'var(--accent)'
        : tier === 'inconsistent'
          ? 'var(--muted)'
          : 'var(--danger)'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      {label}
    </span>
  )
}