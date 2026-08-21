'use client'

import { useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger, usePopover } from '@/components/shared/overlay/Popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { adjustHint, useAdjustStore } from '@/features/payments/adjustStore'
import { cn } from '@/lib/cn'

/**
 * Overpaid / underpaid reminder. Clicking opens a popover asking for the
 * amount; overpaid tags the row "Next month: overpaid" and underpaid
 * tags it "Next month: debt". UI-only — a simple reminder, no math.
 */
export function PaymentAdjust({ houseId, monthKey, className }: { houseId: number; monthKey: string; className?: string }) {
  const annotation = useAdjustStore((s) => s.annotations[`${houseId}:${monthKey}`])
  const set = useAdjustStore((s) => s.set)
  const clear = useAdjustStore((s) => s.clear)
  const hint = adjustHint(annotation)

  if (hint) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
          annotation?.kind === 'overpaid'
            ? 'text-[var(--success)] [background:color-mix(in_srgb,var(--success)_12%,transparent)]'
            : 'text-[var(--danger)] [background:color-mix(in_srgb,var(--danger)_12%,transparent)]',
          className,
        )}
        title={annotation?.kind === 'overpaid' ? 'Overpaid this month — carries to next' : 'Underpaid this month — carries to next'}
      >
        {annotation?.kind === 'overpaid' ? <Plus size={10} /> : <Minus size={10} />}
        {hint}
        <button
          type="button"
          onClick={() => clear(houseId, monthKey)}
          aria-label="Clear adjustment"
          className="ml-0.5 rounded-full p-0.5 opacity-60 transition hover:opacity-100"
        >
          <X size={10} />
        </button>
      </span>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild className="rounded-full p-1 text-[var(--muted)] transition hover:bg-[var(--border)] hover:text-[var(--fg)]">
        <Plus size={13} aria-label="Mark overpaid or underpaid" />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-64">
        <AdjustBody houseId={houseId} monthKey={monthKey} set={set} />
      </PopoverContent>
    </Popover>
  )
}

function AdjustBody({
  houseId,
  monthKey,
  set,
}: {
  houseId: number
  monthKey: string
  set: (houseId: number, monthKey: string, kind: 'overpaid' | 'underpaid', amount: number) => void
}) {
  const { close } = usePopover()
  const [draft, setDraft] = useState('')

  const save = (kind: 'overpaid' | 'underpaid') => {
    const amount = Number(draft)
    if (!draft || Number.isNaN(amount) || amount <= 0) return
    set(houseId, monthKey, kind, Math.round(amount))
    setDraft('')
    close()
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">Adjust payment</div>
        <p className="mt-0.5 text-xs text-[var(--muted)]">Record an overpaid or underpaid amount carried into next month.</p>
      </div>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        placeholder="Amount"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft && Number(draft) > 0) save('underpaid')
        }}
        autoFocus
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-[var(--success)]"
          onClick={() => save('overpaid')}
          disabled={!draft || Number(draft) <= 0}
        >
          <Plus size={13} />
          Overpaid
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-[var(--danger)]"
          onClick={() => save('underpaid')}
          disabled={!draft || Number(draft) <= 0}
        >
          <Minus size={13} />
          Underpaid
        </Button>
      </div>
    </div>
  )
}
