'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const OFFSET_Y = 8

/**
 * A lightweight hover card that appears near the cursor/trigger, fully themed
 * through CSS variables, using framer-motion for the pop. No extra deps.
 */
export function HoverCard({
  trigger,
  children,
}: {
  trigger: ReactNode
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!pos) return
    const onScroll = () => setPos(null)
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [pos])

  const handleEnter = () => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ top: r.bottom + OFFSET_Y, left: r.left })
  }

  return (
    <div ref={wrapRef} className="inline-flex" onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      {trigger}
      <AnimatePresence>
        {pos && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 60 }}
          >
            <div
              data-surface
              className="w-72 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl"
              style={{
                boxShadow: '0 20px 45px -20px rgba(0,0,0,0.45), 0 0 0 1px var(--border)',
              }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}