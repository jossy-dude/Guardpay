import { useStateQuery } from '@/lib/hooks'
import { useDataStore } from '@/features/payments/dataStore'
import { cn } from '@/lib/cn'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { isError, refetch } = useStateQuery() // hydrate data on mount
  const loaded = useDataStore((s) => s.loaded)

  return (
    <div className="w-full">
      {!loaded && (
        <div
          role="status"
          className="mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-[var(--density-x)] py-3 text-sm text-[var(--muted-fg)]"
        >
          {isError ? (
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span>Couldn&apos;t load the ledger from the server.</span>
              <button
                onClick={() => refetch()}
                className="rounded-md bg-[var(--primary)] px-3 py-1 text-xs font-medium text-[var(--primary-fg)] transition-colors hover:bg-[var(--primary-hover)]"
              >
                Retry
              </button>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--primary)]" />
              Loading the ledger…
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

export function Section({
  children,
  className,
  'data-surface': dataSurface = '',
}: {
  children: React.ReactNode
  className?: string
  'data-surface'?: string
}) {
  return (
    <section
      data-surface={dataSurface}
      className={cn(
        'animate-in rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-[var(--density-x)]',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function SectionHead({
  kicker,
  title,
  right,
}: {
  kicker?: React.ReactNode
  title: string
  right?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && (
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">
            {kicker}
          </div>
        )}
        <h2 className="font-display text-xl font-semibold leading-tight">{title}</h2>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}