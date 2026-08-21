'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

/**
 * A right-click (context) menu. Suppresses the native menu, shows items themed
 * to the app, and closes on click-away / Escape. Primarily used to launch
 * in-place edit actions across the app.
 *
 * When `clickToOpen` is set, a left-click on the trigger also opens the menu
 * (positioned under the trigger). Existing callers are unaffected — it
 * defaults to right-click only.
 */
export function ContextMenu({
  items,
  children,
  clickToOpen = false,
}: {
  items: MenuItem[]
  children: ReactNode
  clickToOpen?: boolean
}) {
  const [state, setState] = useState<{ x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!state) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setState(null)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onEsc)
    window.addEventListener('blur', () => setState(null))
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onEsc)
      window.removeEventListener('blur', () => setState(null))
    }
  }, [state])

  return (
    <div
      ref={triggerRef}
      className="inline-block"
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setState({ x: e.clientX, y: e.clientY })
      }}
      onClick={(e) => {
        if (!clickToOpen) return
        e.stopPropagation()
        const el = triggerRef.current
        const r = el?.getBoundingClientRect()
        if (!r) return
        setState({
          x: Math.min(r.left, Math.max(0, window.innerWidth - 190)),
          y: r.bottom + 4,
        })
      }}
    >
      {children}
      <AnimatePresence>
        {state && (
          <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="fixed z-[70] min-w-[180px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-2xl"
            style={{ top: state.y, left: state.x }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                disabled={item.disabled}
                onClick={() => {
                  setState(null)
                  item.onClick()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-[var(--border)]"
                style={{ color: item.danger ? 'var(--danger)' : 'var(--fg)' }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}