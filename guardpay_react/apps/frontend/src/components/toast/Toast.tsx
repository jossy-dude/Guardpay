'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react'
import { useToastStore, type ToastItem, type ToastKind } from './store'
import { useSound } from '@/hooks/useSound'
import { cn } from '@/lib/cn'

const KIND_ICON: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const KIND_SOUND: Record<ToastKind, 'paid' | 'error' | 'whoosh' | 'tick'> = {
  success: 'paid',
  error: 'error',
  warning: 'whoosh',
  info: 'tick',
}

const AUTO_DISMISS_MS = 6000

function ToastView({ toast }: { toast: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const { play } = useSound()
  const Icon = KIND_ICON[toast.kind]

  useEffect(() => {
    play(KIND_SOUND[toast.kind])
  }, [toast.kind, play])

  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [toast.id, dismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      data-surface
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius)] border p-3 shadow-lg',
        'bg-[var(--card)]',
        toast.kind === 'success' && 'border-[var(--success)]',
        toast.kind === 'error' && 'border-[var(--danger)]',
        toast.kind === 'warning' && 'border-[var(--accent)]',
        toast.kind === 'info' && 'border-[var(--border-strong)]',
      )}
      role={toast.kind === 'error' ? 'alert' : 'status'}
    >
      <Icon
        className="mt-0.5 shrink-0"
        color={
          toast.kind === 'success'
            ? 'var(--success)'
            : toast.kind === 'error'
              ? 'var(--danger)'
              : toast.kind === 'warning'
                ? 'var(--accent)'
                : 'var(--muted-fg)'
        }
        size={20}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{toast.title}</div>
        {toast.message && <div className="mt-0.5 text-xs text-[var(--muted)]">{toast.message}</div>}
        {toast.actionLabel && toast.onAction && (
          <button
            onClick={() => {
              toast.onAction?.()
              dismiss(toast.id)
            }}
            className="mt-2 rounded-md bg-[var(--primary)] px-2.5 py-1 text-xs text-[var(--primary-fg)] hover:bg-[var(--primary-hover)]"
          >
            {toast.actionLabel}
          </button>
        )}
      </div>
      <button onClick={() => dismiss(toast.id)} className="shrink-0 rounded p-1 text-[var(--muted)] hover:text-[var(--fg)]" aria-label="Dismiss notification">
        <X size={14} />
      </button>
    </motion.div>
  )
}

export function ToastProvider() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastView key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}