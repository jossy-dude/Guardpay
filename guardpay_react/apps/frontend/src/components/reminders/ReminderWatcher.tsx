'use client'

import { useEffect, useRef } from 'react'
import { useDataStore } from '@/features/payments/dataStore'
import { useToastStore } from '@/components/toast/store'
import { BellRing } from 'lucide-react'

/**
 * Watches the store for active reminders and surfaces them as animated toast
 * popups with a chime, so the admin notices follow-ups even when parked on
 * another page. Dedupes across reloads via localStorage.
 */
const RAISED_IDS = 'guardpay:raised-reminders'

export function ReminderWatcher() {
  const reminders = useDataStore((s) => s.reminders)
  const houses = useDataStore((s) => s.houses)
  const seenRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RAISED_IDS)
      if (raw) seenRef.current = new Set(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    const active = reminders.filter((r) => r.isActive)
    const activeIds = new Set(active.map((r) => r.id))
    // drop ids for reminders that are no longer active so the persisted set
    // never grows unbounded with stale entries
    if (seenRef.current.size > activeIds.size) {
      for (const id of [...seenRef.current]) {
        if (!activeIds.has(id)) seenRef.current.delete(id)
      }
    }
    let changed = false
    for (const r of active) {
      if (seenRef.current.has(r.id)) continue
      seenRef.current.add(r.id)
      changed = true
      const house = houses.find((h) => h.id === r.houseId)
      const label = house ? `${house.houseNumber} · ${house.name}` : 'All households'
      useToastStore.getState().push({
        kind: 'warning',
        title: 'Reminder',
        message: r.note || `Follow up on ${label}`,
        icon: <BellRing size={18} />,
        actionLabel: 'Ok',
      })
      if ('Notification' in window) {
        // Ask once, on first reminder (user intent), then use the result.
        const perm = Notification.permission
        if (perm === 'granted') {
          try {
            new Notification('GuardPay · Reminder', { body: r.note || `Follow up on ${label}` })
          } catch {
            /* ignore */
          }
        } else if (perm === 'default') {
          void Notification.requestPermission()
        }
      }
    }
    if (changed) {
      try {
        localStorage.setItem(RAISED_IDS, JSON.stringify([...seenRef.current]))
      } catch {
        /* ignore */
      }
    }
  }, [reminders, houses])

  return null
}