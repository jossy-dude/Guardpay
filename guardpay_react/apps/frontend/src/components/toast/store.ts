'use client'

import { create } from 'zustand'
import type { ReactNode } from 'react'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export interface ToastItem {
  id: number
  kind: ToastKind
  title: string
  message?: string
  icon?: ReactNode
  onAction?: () => void
  actionLabel?: string
}

interface ToastState {
  toasts: ToastItem[]
  push: (t: Omit<ToastItem, 'id'>) => void
  dismiss: (id: number) => void
}

let seq = 1

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) =>
    set((s) => ({ toasts: [...s.toasts, { ...t, id: seq++ }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

/** Convenience helpers callable from anywhere (incl. event handlers). */
export function toastSuccess(title: string, message?: string) {
  useToastStore.getState().push({ kind: 'success', title, message })
}
export function toastError(title: string, message?: string) {
  useToastStore.getState().push({ kind: 'error', title, message })
}
export function toastInfo(title: string, message?: string) {
  useToastStore.getState().push({ kind: 'info', title, message })
}