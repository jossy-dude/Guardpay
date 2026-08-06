'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Crown, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useDataStore } from '@/features/payments/dataStore'
import { computeAllHouseStats } from '@/features/scoring/scoring'
import { Layout, Section, SectionHead } from '@/components/layout/Layout'
import { Link } from '@/lib/router'
import { ScoreDots, TierBadge } from '@/components/shared/animations'
import { ResidentAvatar } from '@/components/shared/ResidentAvatar'
import { useAvatarPicker } from '@/features/avatars/pickerStore'
import { HoverCard } from '@/components/shared/overlay/HoverCard'
import { ContextMenu } from '@/components/shared/overlay/ContextMenu'
import { Dialog } from '@/components/shared/overlay/Dialog'
import { useHouseMutation, useDeleteHouse } from '@/lib/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toastSuccess } from '@/components/toast/store'
import { formatMoney } from '@/lib/utils'
import { cn } from '@/lib/cn'

const MEDALS = ['🥇', '🥈', '🥉']

type SortKey = 'score' | 'streak' | 'rate' | 'name'

export function LeaderboardPage() {
  const houses = useDataStore((s) => s.houses)
  const payments = useDataStore((s) => s.payments)
  const settings = useDataStore((s) => s.settings)
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [showInactive, setShowInactive] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const rows = useMemo(() => {
    const active = houses.filter((h) => (showInactive ? true : h.active))
    const stats = computeAllHouseStats(active, payments, settings)
    const list = active.map((h) => {
      const s = stats.get(h.id)!
      return {
        id: h.id,
        houseNumber: h.houseNumber,
        name: h.name,
        fee: h.fee,
        active: h.active,
        avatar: h.avatar,
        score: s.reliabilityScore,
        streak: s.currentStreak,
        maxStreak: s.longestStreak,
        rate: s.onTimeRate,
        tier: s.tier,
      }
    })
    const sorters: Record<SortKey, (a: typeof list[0], b: typeof list[0]) => number> = {
      score: (a, b) => b.score - a.score,
      streak: (a, b) => b.streak - a.streak,
      rate: (a, b) => b.rate - a.rate,
      name: (a, b) => a.name.localeCompare(b.name),
    }
    return [...list].sort(sorters[sortKey])
  }, [houses, payments, settings, sortKey, showInactive])

  const top = rows[0]

  return (
    <Layout>
      <SectionHead
        title="Leaderboard"
        kicker="Consistency ranking"
        right={
          <div className="flex items-center gap-2">
            {(['score', 'rate', 'streak', 'name'] as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs capitalize',
                  sortKey === k ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]' : 'border-[var(--border)] hover:bg-[var(--border)]',
                )}
              >
                {k}
              </button>
            ))}
          </div>
        }
      />

      <label className="mb-4 flex items-center gap-2 text-sm text-[var(--muted)]">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="rounded accent-[var(--primary)]"
        />
        Include inactive households
      </label>

      <motion.div layout className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row, idx) => {
          const medal = MEDALS[idx]
          const rank = idx + 1
          const house = useDataStore.getState().houses.find((x) => x.id === row.id)!
          return (
            <motion.div
              layout
              key={row.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.03, 0.6) }}
              className={cn(
                'relative rounded-[var(--radius)] border p-4',
                row.id === top?.id ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--card)]',
              )}
            >
              {row.id === top?.id && (
                <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                  <Crown size={14} />
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <span className="font-display text-2xl font-bold">{medal ?? rank}</span>
                  <HoverCard
                    trigger={<ResidentAvatar house={house} size={40} onClick={() => useAvatarPicker.getState().open(house)} />}
                  >
                    <div className="flex items-center gap-3">
                      <ResidentAvatar house={house} size={52} onClick={() => useAvatarPicker.getState().open(house)} />
                      <div>
                        <div className="font-display text-sm font-semibold">{row.name}</div>
                        <div className="font-mono text-xs text-[var(--muted-fg)]">House {row.houseNumber}</div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 text-sm">
                      <div className="text-[var(--muted)]">Fee</div>
                      <div className="font-medium">{formatMoney(row.fee, settings.currency)}</div>
                      <div className="text-[var(--muted)]">On-time</div>
                      <div className="font-medium">{row.rate}%</div>
                    </div>
                  </HoverCard>
                </span>
                <div className="flex items-center gap-1">
                  <div className="text-right">
                    <div className="font-mono text-sm" style={{ color: 'var(--primary)' }}>
                      House {row.houseNumber}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{row.name}</div>
                  </div>
                  <ContextMenu
                    items={[
                      {
                        label: 'Edit household',
                        icon: <Pencil size={14} />,
                        onClick: () => setEditingId(row.id),
                      },
                      {
                        label: 'Delete household',
                        icon: <Trash2 size={14} />,
                        danger: true,
                        onClick: () => setEditingId(row.id),
                      },
                    ]}
                    clickToOpen
                  >
                    <button
                      className="-mr-1.5 ml-1 rounded-md p-1 text-[var(--muted)] transition hover:bg-[var(--border)] hover:text-[var(--fg)]"
                      aria-label="Household actions"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </ContextMenu>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{row.score}<span className="text-sm text-[var(--muted)]">/100</span></div>
                  <div className="mt-1 flex items-center gap-2">
                    <ScoreDots score={row.score} size={12} />
                    <TierBadge tier={row.tier} />
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium">
                    {row.streak > 0 ? `🔥 ${row.streak} mo streak` : 'No active streak'}
                  </div>
                  <div className="text-[var(--muted)]">Longest: {row.maxStreak} mo</div>
                  <div className="text-[var(--muted)]">{row.rate}% on-time</div>
                </div>
              </div>
            </motion.div>
          )
        })}
      </motion.div>

      {rows.length === 0 && (
        <Section className="py-12 text-center text-[var(--muted)]">
          <p className="mb-3">No households to rank yet.</p>
          <Link
            to="/data"
            className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-colors hover:bg-[var(--primary-hover)]"
          >
            Add households
          </Link>
        </Section>
      )}

      <EditHouseDialog key={editingId ?? 'closed'} houseId={editingId} onClose={() => setEditingId(null)} />
    </Layout>
  )
}

function EditHouseDialog({ houseId, onClose }: { houseId: number | null; onClose: () => void }) {
  const house = useDataStore((s) => s.houses.find((h) => h.id === houseId))
  const saveHouse = useHouseMutation()
  const deleteHouse = useDeleteHouse()
  const [name, setName] = useState(house?.name ?? '')
  const [houseNumber, setHouseNumber] = useState(house?.houseNumber ?? '')
  const [fee, setFee] = useState(String(house?.fee ?? ''))
  const [notes, setNotes] = useState(house?.notes ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (!house) return null

  const submit = () => {
    if (!name.trim() || !houseNumber.trim()) return
    saveHouse.mutate(
      {
        id: house.id,
        name: name.trim(),
        house_number: houseNumber.trim(),
        fee: Number(fee) || house.fee,
        notes: notes.trim(),
      },
      {
        onSuccess: () => {
          toastSuccess('Household updated', `${houseNumber.trim()} · ${name.trim()}`)
          onClose()
        },
      },
    )
  }

  const toggleActive = () => {
    saveHouse.mutate(
      { id: house.id, active: !house.active },
      {
        onSuccess: () => {
          toastSuccess(house.active ? 'Household deactivated' : 'Household restored', house.name)
          onClose()
        },
      },
    )
  }

  const doDelete = () => {
    deleteHouse.mutate(house.id, {
      onSuccess: () => {
        toastSuccess('Household deleted', `${house.houseNumber} · ${house.name}`)
        onClose()
      },
    })
  }

  return (
    <Dialog open={!!houseId} onClose={onClose} title={house.name} kicker={`House ${house.houseNumber}`}>
      <div className="grid grid-cols-1 gap-3">
        <div className="flex items-center gap-3">
          <ResidentAvatar house={house} size={44} />
          <div className="text-xs text-[var(--muted)]">
            Set this household's avatar from anywhere — just tap any resident avatar.
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Resident name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Resident name" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">House number</label>
          <Input value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="House #" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Monthly fee</label>
          <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Notes</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <Button size="sm" variant="outline" onClick={toggleActive} disabled={saveHouse.isPending}>
          {house.active ? 'Deactivate' : 'Restore'}
        </Button>
        <div className="flex items-center gap-2">
          {confirmingDelete ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" onClick={doDelete} disabled={deleteHouse.isPending}>
                Yes, delete
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="text-[var(--danger)]" onClick={() => setConfirmingDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={saveHouse.isPending}>
          {saveHouse.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Dialog>
  )
}