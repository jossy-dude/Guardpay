import { create } from 'zustand'
import { api } from '@/lib/api'

export interface AuthState {
  pinEnabled: boolean
  authenticated: boolean
  loading: boolean
  error: string | null
  check: () => Promise<void>
  login: (pin: string) => Promise<void>
  setPin: (pin: string, currentPin?: string) => Promise<void>
  disablePin: (currentPin: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  pinEnabled: false,
  authenticated: true,
  loading: true,
  error: null,
  check: async () => {
    set({ loading: true })
    try {
      const res = await api.get<{ pin_enabled: boolean; authenticated: boolean }>('/auth/status')
      set({ pinEnabled: res.pin_enabled, authenticated: res.authenticated, loading: false, error: null })
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
    }
  },
  login: async (pin) => {
    set({ loading: true, error: null })
    try {
      await api.post<{ ok: boolean }>('/auth/login', { pin })
      set({ authenticated: true, loading: false })
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
      throw e
    }
  },
  setPin: async (pin, currentPin) => {
    set({ loading: true, error: null })
    try {
      await api.post<{ ok: boolean }>('/auth/set-pin', { pin, current_pin: currentPin ?? null })
      set({ pinEnabled: true, loading: false })
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
      throw e
    }
  },
  disablePin: async (currentPin) => {
    set({ loading: true, error: null })
    try {
      await api.post<{ ok: boolean }>('/auth/disable', { current_pin: currentPin })
      set({ pinEnabled: false, authenticated: true, loading: false })
    } catch (e) {
      set({ loading: false, error: (e as Error).message })
      throw e
    }
  },
}))