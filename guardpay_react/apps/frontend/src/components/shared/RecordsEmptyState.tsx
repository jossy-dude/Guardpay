'use client'

import { Button } from '@/components/ui/button'

/** Shared teaching empty state: a friendly call-to-action when there are no
 *  households yet, or a search-no-match message. Used by Records, Data and
 *  Dashboard pages so the copy and actions stay consistent. */
export function RecordsEmptyState({
  searching,
  onAdd,
}: {
  /** True when a search/filter is active but nothing matched. */
  searching: boolean
  /** Opens the add-house flow; only shown when not searching. */
  onAdd?: () => void
}) {
  if (searching) {
    return (
      <div className="py-14 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-[var(--border)] text-[var(--muted)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[var(--fg)]">No matches</p>
        <p className="mt-1 text-xs text-[var(--muted)]">Nothing matched your search. Try a different name or house number.</p>
      </div>
    )
  }

  return (
    <div className="py-14 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-[var(--border)] text-[var(--muted)]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-medium text-[var(--fg)]">No households yet</p>
      <p className="mt-1 text-xs text-[var(--muted)]">Add your first household to start tracking payments.</p>
      {onAdd && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onAdd}>
          Add household
        </Button>
      )}
    </div>
  )
}
