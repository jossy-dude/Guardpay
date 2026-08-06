import * as React from 'react'
import { cn } from '@/lib/cn'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-surface
      className={cn(
        'rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] shadow-sm',
        className,
      )}
      {...props}
    />
  ),
)
Card.displayName = 'Card'

export { Card }