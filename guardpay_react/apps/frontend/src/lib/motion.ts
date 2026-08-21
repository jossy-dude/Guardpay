'use client'

/**
 * Shared spring physics tokens (research-informed).
 *
 * Press: scale 0.95–0.98, held ~100–160ms, spring release with slight overshoot.
 * Hover: lift + shadow; ~8% surface shift handled per-component.
 * Everything honours `prefers-reduced-motion` via MotionConfig at the root.
 */
export const pressSpring = {
  type: 'spring',
  stiffness: 420,
  damping: 24,
  mass: 0.6,
} as const

export const stampSpring = {
  type: 'spring',
  stiffness: 480,
  damping: 18,
  mass: 0.7,
} as const

export const settleSpring = {
  type: 'spring',
  stiffness: 300,
  damping: 22,
} as const

/** Enter animation used by staggered card/row reveals. */
export const staggerParent = {
  initial: 'hidden',
  animate: 'show',
  variants: {
    hidden: {},
    show: { transition: { staggerChildren: 0.045 } },
  },
} as const

export const staggerChild = {
  variants: {
    hidden: { opacity: 0, y: 10, scale: 0.98 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: 'spring', stiffness: 340, damping: 26 },
    },
  },
} as const
