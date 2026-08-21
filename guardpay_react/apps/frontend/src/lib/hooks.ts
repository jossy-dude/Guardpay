'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDataStore } from '@/features/payments/dataStore'
import { api } from '@/lib/api'
import { toastError, toastSuccess } from '@/components/toast/store'
import type { ApiStateResponse, Payment } from '@/lib/types'

export const stateKeys = {
  all: ['state'] as const,
  state: () => [...stateKeys.all, 'state'] as const,
}

/** Fetch the full app state once and hydrate the local store. */
export function useStateQuery() {
  const setState = useDataStore((s) => s.setState)
  const query = useQuery({
    queryKey: stateKeys.state(),
    queryFn: () => api.get<ApiStateResponse>('/state'),
    refetchOnWindowFocus: false,
  })
  useEffect(() => {
    if (query.data) setState(query.data)
  }, [query.data, setState])
  return query
}

export function useHouseMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      payload.id
        ? api.put('/houses/update', payload)
        : api.post('/houses', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: stateKeys.all }),
    onError: (err) => {
      toastError('Could not save household', (err as Error).message)
    },
  })
}

export function useBulkHouseMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { lines: string[]; default_fee: number }) =>
      api.post('/houses/bulk', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: stateKeys.all }),
    onError: (err) => {
      toastError('Could not add households in bulk', (err as Error).message)
    },
  })
}

export function useHouseImportMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      households: {
        house_number: string
        name: string
        fee?: number | null
        aliases?: string[]
        months?: string[]
        payments?: { month: string; amount?: number | null; note?: string }[]
        paid_day?: number | null
        opening_balance?: number
      }[]
      default_fee: number
      calendar_mode: string
    }) => api.post('/houses/import', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: stateKeys.all }),
    onError: (err) => {
      toastError('Could not import households', (err as Error).message)
    },
  })
}

export function useDeleteHouse() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.post('/houses/delete', { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: stateKeys.all }),
    onError: (err) => {
      toastError('Could not delete household', (err as Error).message)
    },
  })
}

export function useTogglePayment() {
  const qc = useQueryClient()
  const upsertPayment = useDataStore((s) => s.upsertPayment)
  const removePayment = useDataStore((s) => s.removePayment)
  const buildPayment = (vars: {
    house_id: number
    month_key: string
    paid: boolean
    date?: string
    amount?: number
    note?: string
  }, id: number): Payment => {
    // fall back to the household fee so an optimistic flip never flashes `0`
    const house = useDataStore.getState().houses.find((h) => h.id === vars.house_id)
    return {
      id,
      houseId: vars.house_id,
      monthKey: vars.month_key,
      paidDate: vars.date ?? null,
      amount: vars.amount ?? house?.fee ?? 0,
      note: vars.note ?? '',
      source: 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }
  return useMutation({
    mutationFn: (payload: {
      house_id: number
      month_key: string
      paid: boolean
      date?: string
      amount?: number
      note?: string
    }) => api.post<{ id?: number; paid: boolean }>('/houses/payments/toggle', payload),
    onMutate: (vars) => {
      const optimisticId = -Date.now()
      // optimistic flip so the UI responds instantly (no refetch yet — a
      // refetch here can clobber the optimistic row before the server commits)
      if (vars.paid) upsertPayment(buildPayment(vars, optimisticId))
      else removePayment(vars.house_id, vars.month_key)
    },
    onSuccess: (data, vars) => {
      // reconcile the optimistic row: upsert with the server's real id (the
      // store matches by houseId+monthKey, so the synthetic id is replaced)
      if (data.paid) upsertPayment(buildPayment(vars, data.id ?? -Date.now()))
      else removePayment(vars.house_id, vars.month_key)
    },
    onError: (err) => {
      // roll the optimistic flip back via a single refetch on settle below
      toastError('Could not save payment', (err as Error).message)
    },
    onSettled: () => {
      // ONE refetch per toggle — keeps the server state in sync after commit
      qc.invalidateQueries({ queryKey: stateKeys.all })
    },
  })
}

export function useAddAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { house_id: number; alias: string }) => api.post('/aliases/add', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: stateKeys.all }),
    onError: (err) => {
      toastError('Could not add alias', (err as Error).message)
    },
  })
}

export function useDeleteAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: number }) => api.post('/aliases/delete', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: stateKeys.all }),
    onError: (err) => {
      toastError('Could not remove alias', (err as Error).message)
    },
  })
}

export function useGuardMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/guard/payments', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: stateKeys.all }),
    onError: (err) => {
      toastError('Could not record guard payment', (err as Error).message)
    },
  })
}

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/settings', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: stateKeys.all }),
    onError: (err) => {
      toastError('Could not save settings', (err as Error).message)
    },
  })
}

export function useReminderMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { house_id: number; note?: string }) => api.post('/reminders/add', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: stateKeys.all }),
    onError: (err) => {
      toastError('Could not add reminder', (err as Error).message)
    },
  })
}

export function useResolveReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.post('/reminders/resolve', { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: stateKeys.all }),
    onError: (err) => {
      toastError('Could not resolve reminder', (err as Error).message)
    },
  })
}

export interface BackupEntry {
  file: string
  size: number
  modified: string
}

/** List server-side SQLite snapshots (used for restore). */
export function useBackupList() {
  return useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get<BackupEntry[]>('/backups'),
    staleTime: 10_000,
  })
}

export function useCreateBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; file: string }>('/backups/create'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] })
      toastSuccess('Backup created', 'Snapshot saved on the server.')
    },
    onError: (err) => toastError('Could not create backup', (err as Error).message),
  })
}

export function useRestoreBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: string) => api.post<{ ok: boolean; restart: boolean }>('/backups/restore', { file }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stateKeys.all })
    },
    onError: (err) => toastError('Could not restore backup', (err as Error).message),
  })
}

/** Download a server-side `.db` snapshot to the user's disk. */
export async function downloadBackup(file: string) {
  const res = await fetch(`/api/backups/download/${encodeURIComponent(file)}`)
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export interface PublicLookup {
  house_id: number
  name: string
  house_number: string
  fee: number
}

export function usePublicLookup(code: string, enabled: boolean) {
  return useQuery({
    queryKey: ['public', 'house', code],
    queryFn: () => api.get<PublicLookup>(`/public/house/${code}`),
    enabled: enabled && code.length >= 4,
    retry: false,
    gcTime: 60_000,
    staleTime: 30_000,
  })
}

export interface PublicStatus {
  name: string
  house_number: string
  fee: number
  current_streak: number
  on_time_rate: number
  reliability_score: number
  tier: string
  history: PublicMonth[]
}

interface PublicMonth {
  month_key: string
  status: string
  days_diff: number
  paid_date: string | null
  amount: number | null
}

export function usePublicStatus(houseId: number | null, accessCode: string) {
  return useQuery({
    queryKey: ['public', 'status', houseId],
    queryFn: () =>
      api.get<PublicStatus>(
        `/public/status/${houseId}?access_code=${encodeURIComponent(accessCode)}`,
      ),
    enabled: houseId !== null && accessCode.length >= 4,
    retry: false,
  })
}