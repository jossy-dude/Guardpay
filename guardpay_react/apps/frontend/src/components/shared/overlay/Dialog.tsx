'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * A themed modal dialog with a spring pop and backdrop fade. Fits the current
 * theme's border radius / colors automatically via CSS variables.
 */
export function Dialog({
  open,
  onClose,
  title,
  kicker,
  children,
  footer,
  from = 'center',
  ariaLabel,
  panelClassName,
}: {
  open: boolean
  onClose: () => void
  title?: string
  kicker?: string
  children: ReactNode
  footer?: ReactNode
  from?: 'center' | 'top' | 'right'
  ariaLabel?: string
  panelClassName?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const labelledBy = useId()
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement as HTMLElement | null
    // move focus into the dialog for keyboard users
    const elapsed = window.setTimeout(() => panelRef.current?.focus(), 0)
    return () => window.clearTimeout(elapsed)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previousFocus.current?.focus()
      previousFocus.current = null
    }
  }, [open, onClose])

  const start =
    from === 'top'
      ? { opacity: 0, y: -24 }
      : from === 'right'
        ? { opacity: 0, x: 48 }
        : { opacity: 0, scale: 0.94 }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          aria-hidden="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel ?? title}
            aria-labelledby={title ? labelledBy : undefined}
            tabIndex={-1}
            initial={start}
            animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
            exit={start}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                onClose()
              }
            }}
            className={cn(
              'w-full max-w-md rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] outline-none',
              panelClassName,
            )}
            style={{ boxShadow: '0 30px 60px -20px rgba(0,0,0,0.5)' }}
            data-surface
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
              <div>
                {kicker && (
                  <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
                    {kicker}
                  </div>
                )}
                {title && (
                  <h2 id={labelledBy} className="font-display text-lg font-semibold leading-tight">
                    {title}
                  </h2>
                )}
              </div>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-[var(--muted)] transition hover:bg-[var(--border)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4">{children}</div>
            {footer && (
              <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">{footer}</div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}