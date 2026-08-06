'use client'

import { create } from 'zustand'
import type { Household } from '@/lib/types'

interface AvatarPickerState {
  house: Household | null
  open: (house: Household) => void
  close: () => void
}

export const useAvatarPicker = create<AvatarPickerState>((set) => ({
  house: null,
  open: (house) => set({ house }),
  close: () => set({ house: null }),
}))
