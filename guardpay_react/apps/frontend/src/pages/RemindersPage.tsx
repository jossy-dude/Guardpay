'use client'

import { useState } from 'react'
import { useDataStore } from '@/features/payments/dataStore'
import { Layout, Section, SectionHead } from '@/components/layout/Layout'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useReminderMutation, useResolveReminder } from '@/lib/hooks'
import { formatDate } from '@/lib/utils'
import { toastError, toastSuccess } from '@/components/toast/store'

export function RemindersPage() {
  const reminders = useDataStore((s) => s.reminders)
  const houses = useDataStore((s) => s.houses)
  const addReminder = useReminderMutation()
  const resolveReminder = useResolveReminder()
  const [text, setText] = useState('')
  const [houseId, setHouseId] = useState(() => String(houses[0]?.id ?? ''))

  const active = reminders.filter((r) => r.isActive)

  const onAdd = () => {
    if (!text.trim()) return
    if (!houseId) {
      toastError('Pick a household', 'A reminder must be tied to a house.')
      return
    }
    addReminder.mutate(
      {
        house_id: Number(houseId),
        note: text.trim(),
      },
      {
        onSuccess: () => {
          toastSuccess('Reminder added')
          setText('')
        },
      },
    )
  }

  return (
    <Layout>
      <SectionHead title="Reminders" kicker="Follow-ups" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section>
          <SectionHead title="New reminder" kicker="Add" />
          <div className="mb-3">
            <label htmlFor="reminder-house" className="mb-1 block text-xs font-medium text-[var(--muted)]">House (required)</label>
            <select
              id="reminder-house"
              value={houseId}
              onChange={(e) => setHouseId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.houseNumber} — {h.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Note</label>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAdd()}
              placeholder="e.g. follow up on unpaid month"
            />
          </div>
          <Button onClick={onAdd} disabled={!text.trim() || addReminder.isPending}>
            {addReminder.isPending ? 'Adding…' : 'Add reminder'}
          </Button>
        </Section>

        <Section className="lg:col-span-2">
          <SectionHead title="Active" kicker={`${active.length} open`} />
          {active.length === 0 ? (
            <div className="py-10 text-center text-[var(--muted)]">No active reminders.</div>
          ) : (
            <ul className="space-y-2">
              {active.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />
                    <div>
                      <div>{r.note}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {r.houseNumber
                          ? `${r.houseNumber} · ${formatDate(r.createdAt)}`
                          : `All households · ${formatDate(r.createdAt)}`}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => resolveReminder.mutate(r.id)}>
                    Done
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </Layout>
  )
}