'use client'

import { motion } from 'framer-motion'

/**
 * Small tasteful confetti burst in theme colors — used for milestones
 * (e.g. the whole month settled). Renders 12 light pieces that pop outward
 * and settle with gravity. Honours prefers-reduced-motion via MotionConfig.
 */
const COLORS = ['var(--primary)', 'var(--accent)', 'var(--success)', 'var(--muted)']
const PIECES = Array.from({ length: 12 })

export function ConfettiBurst({ size = 80 }: { size?: number }) {
  return (
    <span
      className="pointer-events-none absolute left-1/2 top-1/2 z-10"
      style={{ width: 0, height: 0 }}
      aria-hidden="true"
    >
      {PIECES.map((_, i) => {
        const angle = (i / PIECES.length) * Math.PI * 2 + Math.random() * 0.5
        const dist = size * (0.6 + Math.random() * 0.5)
        const x = Math.cos(angle) * dist
        const y = Math.sin(angle) * dist
        const rotate = Math.random() * 320 - 160
        return (
          <motion.span
            key={i}
            className="absolute block h-1.5 w-1.5 rounded-[1px]"
            style={{ background: COLORS[i % COLORS.length] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
            animate={{
              x,
              y,
              opacity: [1, 1, 0],
              scale: [0.4, 1, 0.9],
              rotate,
            }}
            transition={{ duration: 0.7 + Math.random() * 0.3, ease: 'easeOut' }}
          />
        )
      })}
    </span>
  )
}
