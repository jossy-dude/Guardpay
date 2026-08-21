'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/cn'

export type PopoverSide = 'top' | 'bottom' | 'left' | 'right'
export type PopoverAlign = 'start' | 'center' | 'end'

interface PopoverCtx {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
  registerTrigger: (el: HTMLButtonElement | null) => void
  registerContent: (el: HTMLDivElement | null) => void
}

const Ctx = createContext<PopoverCtx | null>(null)

function usePopoverCtx() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('Popover components must be used within <Popover>')
  return ctx
}

/** Hook that gives consumers access to close the popover programmatically. */
export function usePopover() {
  const { setOpen } = usePopoverCtx()
  return { close: () => setOpen(false) }
}

/**
 * A themed, dependency-free popover with a Radix-like API
 * (`Popover` / `PopoverTrigger` / `PopoverContent`). Content is positioned
 * relative to the trigger via `side` / `sideOffset` / `align` / `alignOffset`
 * and closes on outside click, Escape or blur.
 *
 * Usage:
 * ```tsx
 * <Popover>
 *   <PopoverTrigger>Open</PopoverTrigger>
 *   <PopoverContent side="bottom" align="end">…body…</PopoverContent>
 * </Popover>
 * ```
 */
export function Popover({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onEsc)
    window.addEventListener('blur', () => setOpen(false))
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onEsc)
      window.removeEventListener('blur', () => setOpen(false))
    }
  }, [open])

  return (
    <Ctx.Provider
      value={{
        open,
        setOpen,
        toggle: () => setOpen((v) => !v),
        registerTrigger: (el) => (triggerRef.current = el),
        registerContent: (el) => (contentRef.current = el),
      }}
    >
      <div className="relative inline-block">{children}</div>
    </Ctx.Provider>
  )
}

export function PopoverTrigger({ children, asChild = false, className }: { children: ReactNode; asChild?: boolean; className?: string }) {
  const { toggle, registerTrigger } = usePopoverCtx()
  return (
    <button
      type="button"
      ref={registerTrigger}
      onClick={(e) => {
        e.stopPropagation()
        toggle()
      }}
      className={asChild ? className : cn('inline-flex items-center', className)}
    >
      {children}
    </button>
  )
}

export function PopoverContent({
  children,
  className,
  side = 'bottom' as PopoverSide,
  sideOffset = 8,
  align = 'start' as PopoverAlign,
  alignOffset = 0,
}: {
  children: ReactNode
  className?: string
  side?: PopoverSide
  sideOffset?: number
  align?: PopoverAlign
  alignOffset?: number
}) {
  const { open, registerContent } = usePopoverCtx()

  const hPlacement = (): React.CSSProperties => {
    if (align === 'end') return { right: `${alignOffset}px` }
    if (align === 'center') return { left: '50%', transform: `translateX(-50%) translateX(${alignOffset}px)` }
    return { left: `${alignOffset}px` }
  }
  const vPlacement = (): React.CSSProperties => {
    if (side === 'top') return { bottom: `calc(100% + ${sideOffset}px)` }
    if (side === 'left') return { right: `calc(100% + ${sideOffset}px)` }
    if (side === 'right') return { left: `calc(100% + ${sideOffset}px)` }
    return { top: `calc(100% + ${sideOffset}px)` }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={registerContent}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.14 }}
          className={cn('absolute z-[70] min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl', className)}
          style={{
            ...hPlacement(),
            ...vPlacement(),
            transformOrigin: side === 'top' ? '50% 100%' : '50% 0%',
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}