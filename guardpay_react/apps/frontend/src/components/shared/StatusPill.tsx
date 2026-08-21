'use client'

import { cn } from '@/lib/cn'
import type { MonthStatus } from '@/lib/types'
import { StatusStamp } from './StatusStamp'

export function StatusPill({
  status,
  onClick,
  pressed,
  className,
}: {
  status: MonthStatus | null
  onClick?: () => void
  /** Reflects a toggled "paid" state so the pill can announce it (aria-pressed). */
  pressed?: boolean
  className?: string
}) {
  if (status === null) {
    return (
      <span className={cn('text-xs text-[var(--muted)]', className)} title="Not yet established">
        —
      </span>
    )
  }
  return (
    <StatusStamp
      status={status}
      onClick={onClick}
      pressed={pressed}
      className={className}
    />
  )
}
