'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shuffle } from 'lucide-react'
import { Dialog } from '@/components/shared/overlay/Dialog'
import { ResidentAvatar } from '@/components/shared/ResidentAvatar'
import { useAvatarPicker } from '@/features/avatars/pickerStore'
import { parseAvatarConfig, toConfigString, randomConfig, DEFAULT_CONFIG, type AvatarConfig } from '@/features/avatars/engine'
import { HAIR_COLORS, HEADWEARS, PRESET_GROUPS, SKIN_TONES } from '@/features/avatars/presets'
import { useHouseMutation } from '@/lib/hooks'
import { useSound } from '@/hooks/useSound'
import { cn } from '@/lib/cn'
import { pressSpring, stampSpring, staggerChild, staggerParent } from '@/lib/motion'

export function AvatarPicker() {
  const house = useAvatarPicker((s) => s.house)
  const close = useAvatarPicker((s) => s.close)
  const { play } = useSound()
  const mutation = useHouseMutation()
  const [draft, setDraft] = useState<AvatarConfig | null>(null)

  useEffect(() => {
    if (house) setDraft(parseAvatarConfig(house.avatar))
  }, [house])

  const previewKey = useMemo(() => Math.random().toString(36).slice(2), [draft])

  if (!house) return null

  const previewHouse = { id: house.id, name: house.name, avatar: draft ? toConfigString(draft) : null }

  const selectPreset = (config: AvatarConfig) => {
    play('toggle')
    setDraft(config)
  }

  const patch = (part: Partial<AvatarConfig>) => {
    play('hover')
    setDraft((d) => ({ ...(d ?? DEFAULT_CONFIG), ...part }))
  }

  const save = () => {
    mutation.mutate(
      {
        id: house.id,
        name: house.name,
        house_number: house.houseNumber,
        fee: house.fee,
        notes: house.notes,
        active: house.active,
        avatar: draft ? toConfigString(draft) : null,
      },
      {
        onSuccess: () => {
          play('paid')
          close()
        },
      },
    )
  }

  const headwearCurrent = HEADWEARS.find((h) => h.top === draft?.top)?.top

  return (
    <Dialog
      open={!!house}
      onClose={close}
      title="Resident avatar"
      kicker={house.name}
      panelClassName="max-w-xl"
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              play('toggle')
              setDraft(null)
            }}
            className="mr-auto rounded-lg px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
          >
            Reset to default
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm transition hover:bg-[var(--border)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={mutation.isPending}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-60"
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Live preview */}
        <div className="flex items-center gap-4">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={previewKey}
              initial={{ scale: 0.6, rotate: -6 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={stampSpring}
            >
              <ResidentAvatar house={previewHouse} size={72} />
            </motion.div>
          </AnimatePresence>
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold">{house.name}</div>
            <div className="text-xs text-[var(--muted)]">
              {draft ? 'Customized face' : 'No face set — showing a placeholder.'}
            </div>
          </div>
        </div>

        {/* Curated grid */}
        <div className="max-h-56 space-y-4 overflow-y-auto pr-1">
          {PRESET_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                {group.title}
              </div>
              <motion.div {...staggerParent} className="grid grid-cols-5 gap-2">
                {group.presets.map((p) => {
                  const selected = draft ? toConfigString(draft) === toConfigString(p.config) : false
                  return (
                    <motion.button
                      key={p.label}
                      type="button"
                      {...staggerChild}
                      whileHover={{ y: -2, scale: 1.05 }}
                      whileTap={{ scale: 0.94 }}
                      transition={pressSpring}
                      onClick={() => selectPreset(p.config)}
                      className={cn(
                        'relative flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--primary)]',
                        selected ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:bg-[var(--border)]/60',
                      )}
                    >
                      {selected && (
                        <motion.span
                          layoutId="avatar-pick-ring"
                          transition={stampSpring}
                          className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-[var(--primary)]"
                        />
                      )}
                      <ResidentAvatar house={{ id: house.id, name: p.label, avatar: toConfigString(p.config) }} size={40} />
                      <span className="line-clamp-1 text-center text-[10px] leading-tight text-[var(--muted)]">{p.label}</span>
                    </motion.button>
                  )
                })}
              </motion.div>
            </div>
          ))}
        </div>

        {/* Customize */}
        <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">Customize</div>

          <div>
            <div className="mb-1.5 text-xs font-medium">Skin tone</div>
            <div className="flex gap-1.5">
              {SKIN_TONES.map((s) => (
                <button
                  key={s.hex}
                  type="button"
                  onClick={() => patch({ skin: s.hex })}
                  aria-label={s.label}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition focus-visible:outline-2 focus-visible:outline-[var(--primary)]',
                    draft?.skin === s.hex ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/40' : 'border-transparent hover:scale-110',
                  )}
                  style={{ background: s.hex }}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium">Headwear</div>
            <div className="flex flex-wrap gap-1.5">
              {HEADWEARS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => patch({ top: h.top })}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-[var(--primary)]',
                    headwearCurrent === h.top ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]' : 'border-[var(--border)] hover:bg-[var(--border)]/60',
                  )}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium">Hair color</div>
            <div className="flex gap-1.5">
              {HAIR_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => patch({ hair: c.hex })}
                  aria-label={c.label}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition focus-visible:outline-2 focus-visible:outline-[var(--primary)]',
                    draft?.hair === c.hex ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/40' : 'border-transparent hover:scale-110',
                  )}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['glasses', 'facialHair'] as const).map((k) => {
              const on = (draft?.[k] ?? 'none') !== 'none'
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => patch({ [k]: on ? 'none' : k === 'glasses' ? 'round' : 'beardLight' })}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs capitalize transition focus-visible:outline-2 focus-visible:outline-[var(--primary)]',
                    on ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]' : 'border-[var(--border)] hover:bg-[var(--border)]/60',
                  )}
                >
                  {k === 'glasses' ? 'Glasses' : 'Beard'}
                </button>
              )
            })}
          </div>
        </div>

        {/* Random */}
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={() => {
              play('toggle')
              setDraft(randomConfig())
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium transition hover:bg-[var(--border)]/60 focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
          >
            <Shuffle size={14} /> Random face
          </button>
          <span className="text-[10px] text-[var(--muted)]">Avatars by Pablo Stanley — Avataaars</span>
        </div>
      </div>
    </Dialog>
  )
}
