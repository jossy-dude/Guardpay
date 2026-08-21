'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * In-place editable text. Shows plain text; clicking (or right-clicking, when
 * `context`) swaps it for an input. Used for quick field edits across pages.
 */
export function InlineEdit({
  value,
  onSave,
  ariaLabel,
  allowContextEdit = false,
  className,
}: {
  value: string
  onSave: (next: string) => void
  ariaLabel: string
  allowContextEdit?: boolean
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const begin = () => {
    setDraft(value)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== value) onSave(next)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-full rounded border border-[var(--primary)] bg-[var(--card)] px-1 py-0.5 text-[var(--fg)] outline-none"
      />
    )
  }

  return (
    <span
      className={
        allowContextEdit
          ? `group/ie relative cursor-text rounded hover:bg-[var(--border)] ${className ?? ''}`
          : `cursor-pointer rounded hover:bg-[var(--border)] ${className ?? ''}`
      }
      tabIndex={0}
      role="button"
      onClick={begin}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          begin()
        }
      }}
      onContextMenu={(e) => {
        if (allowContextEdit) {
          e.preventDefault()
          begin()
        }
      }}
      aria-label={ariaLabel}
      title={allowContextEdit ? 'Click or right-click to edit' : 'Click to edit'}
    >
      {value}
    </span>
  )
}