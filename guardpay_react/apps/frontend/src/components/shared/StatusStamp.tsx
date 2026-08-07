'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { stampSpring } from '@/lib/motion'
import type { MonthStatus } from '@/lib/types'

/**
 * Stamp-style status badge — a small rounded box, slightly tilted like a
 * stamped label. Paid reads as a solid inked stamp with a drawn-on check;
 * unpaid reads as an open dashed box. Alternating tilt per row gives the
 * ledger a hand-made feel.
 *
 * When `onClick` is provided it becomes a toggle button that plays a stamp-in
 * settle (scale 0.6 → 1.05 → 1) with a rotation wiggle on every flip.
 */

const CHECK_PATH = 'M8 13.5 L12.5 18 L20 8.5'

interface StampMeta {
  label: string
  /** solid fill for "inked" states */
  fill?: string
  /** foreground (check / text) on top of the fill */
  on?: string
  /** dashed border for "open" states */
  border?: string
  /** text colour when there is no fill */
  text?: string
}

const STAMP_META: Record<MonthStatus, StampMeta> = {
  ontime: { label: 'Paid', fill: 'var(--success)', on: 'var(--bg)' },
  unpaid: { label: 'Unpaid', border: 'var(--danger)', text: 'var(--danger)' },
  upcoming: { label: 'Due', border: 'var(--muted)', text: 'var(--muted)' },
}

export function StatusStamp({
  status,
  onClick,
  pressed,
  index = 0,
  className,
}: {
  status: MonthStatus | null
  onClick?: () => void
  /** optimistic "paid" state while a toggle is in flight */
  pressed?: boolean
  /** row index — drives the alternating ledger tilt */
  index?: number
  className?: string
}) {
  const meta = status ? STAMP_META[status] : null
  const [flipKey, setFlipKey] = useState(0)
  const [hasFlipped, setHasFlipped] = useState(false)
  const prevStatus = useRef(status)

  // stamp-in re-trigger when the resolved status changes (not on first mount)
  useEffect(() => {
    if (prevStatus.current !== status) {
      setFlipKey((k) => k + 1)
      setHasFlipped(true)
      prevStatus.current = status
    }
  }, [status])

  if (status === null) {
    return (
      <span className={cn('inline-flex items-center text-xs text-[var(--muted)]', className)}>
        —
      </span>
    )
  }

  // alternating tilt: odd rows lean one way, even the other
  const tilt = index % 2 === 0 ? -7 : 4.5
  const isPaid = status === 'ontime'
  const Comp = onClick ? motion.button : motion.span
  const content = (
    <>
      {meta?.fill ? (
        <>
          <span
            className="pointer-events-none absolute inset-0 rounded-[3px]"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.22), transparent 45%)',
            }}
            aria-hidden="true"
          />
          {isPaid ? (
            <motion.svg
              width="26"
              height="26"
              viewBox="0 0 28 28"
              className="relative"
              aria-hidden="true"
            >
              <motion.path
                d={CHECK_PATH}
                fill="none"
                stroke={meta.on}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.32, delay: 0.08, ease: 'easeOut' }}
              />
            </motion.svg>
          ) : (
            <span className="relative px-0.5" style={{ color: meta.on }}>
              {meta.label}
            </span>
          )}
        </>
      ) : (
        <span className="relative flex items-center gap-1 px-0.5">
          <span aria-hidden="true">✕</span>
          <span>{meta?.label}</span>
        </span>
      )}
    </>
  )

  return (
    <Comp
      key={flipKey}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick && typeof pressed === 'boolean' ? pressed : undefined}
      title={onClick ? `Click to toggle ${meta?.label}` : undefined}
      className={cn(
        'relative inline-flex select-none items-center justify-center',
        'rounded-[3px] text-[10px] font-semibold uppercase tracking-[0.08em]',
        'h-6 min-w-7 px-1',
        onClick && 'cursor-pointer',
        className,
      )}
      style={{
        background: meta?.fill ?? 'transparent',
        color: meta?.fill ? meta.on : meta?.text,
        border: meta?.fill ? 'none' : `2px dashed ${meta?.border}`,
        boxShadow: meta?.fill
          ? '0 1px 2px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.25)'
          : undefined,
        transformOrigin: '50% 70%',
      }}
      initial={hasFlipped ? { scale: 0.6, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1, rotate: tilt }}
      transition={stampSpring}
      whileTap={onClick ? { scale: 0.92 } : undefined}
    >
      <motion.span
        className="flex items-center gap-0.5"
        animate={onClick ? { scale: [1, 1.06, 1] } : undefined}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        {content}
      </motion.span>
      <AnimatePresence>
        {hasFlipped && (
          <motion.span
            key="sweep"
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[3px]"
            aria-hidden="true"
          >
            <motion.span
              className="absolute inset-y-0 w-1/2"
              style={{
                background: `linear-gradient(100deg, transparent, color-mix(in srgb, var(--bg) 55%, transparent), transparent)`,
              }}
              initial={{ x: '-150%' }}
              animate={{ x: '300%' }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            />
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {pressed && (
          <motion.span
            key="pending"
            className="pointer-events-none absolute inset-0 rounded-[3px]"
            style={{ boxShadow: '0 0 0 2px var(--primary)' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
    </Comp>
  )
}
