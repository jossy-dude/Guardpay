'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { useThemeStore, THEME_LIST, FONTS, type ThemeDefinition } from '@/features/theming/themes'
import { Layout, Section, SectionHead } from '@/components/layout/Layout'
import { AnimatedMascot } from '@/components/shared/AnimatedMascot'
import { cn } from '@/lib/cn'
import type { MascotSpriteKey, ThemeId } from '@/lib/types'

const DENSITIES = [
  { id: 'compact', label: 'Compact' },
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'spacious', label: 'Spacious' },
]

function MiniDashboardPreview({ colors, sprite }: { colors: ThemeDefinition['colors']; sprite: MascotSpriteKey }) {
  return (
    <div className="flex h-full flex-col gap-1.5 rounded-md border border-black/10 bg-black/5 p-2" style={{ color: '#111' }}>
      <div className="h-1.5 w-3/4 rounded-sm" style={{ background: colors.primary }} />
      <div className="flex gap-1">
        {[colors.success, colors.success, colors.danger, colors.accent].map((c, i) => (
          <span key={i} className="h-1.5 flex-1 rounded-sm" style={{ background: c }} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="h-4 w-4 self-end" style={{ background: colors.secondary, borderRadius: 4 }}>
          <AnimatedMascot sprite={sprite} size={16} />
        </span>
        <span className="h-4 w-10 rounded-sm" style={{ background: colors.heat[2] ?? colors.accent }} />
      </div>
    </div>
  )
}

export function AppearancePage() {
  const { themeId, setTheme } = useThemeStore()
  const [preview, setPreview] = useState<ThemeId>(themeId)
  const [hoverId, setHoverId] = useState<ThemeId | null>(null)

  return (
    <Layout>
      <SectionHead title="Appearance" kicker="Make it yours" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Theme gallery */}
        <Section className="lg:col-span-2">
          <SectionHead title="Themes" kicker="Choose a character" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {THEME_LIST.map((theme) => {
              const selected = preview === theme.id
              return (
                <button
                  key={theme.id}
                  onClick={() => setPreview(theme.id)}
                  onDoubleClick={() => setTheme(theme.id)}
                  onMouseEnter={() => setHoverId(theme.id)}
                  onMouseLeave={() => setHoverId(null)}
                  className={cn(
                    'group relative overflow-hidden rounded-[var(--radius)] border p-3 text-left transition-all hover:scale-[1.02]',
                    selected ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/40' : 'border-[var(--border)] hover:border-[var(--primary)]/50',
                  )}
                  style={{
                    background: `color-mix(in srgb, ${theme.colors.card} 78%, transparent)`,
                    color: theme.colors.foreground,
                    backdropFilter: 'blur(6px)',
                  }}
                >
                  <span
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `linear-gradient(135deg, color-mix(in srgb, ${theme.colors.primary} 26%, transparent), color-mix(in srgb, ${theme.colors.accent} 22%, transparent))`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'color-mix(in srgb, #ffffff 45%, transparent)' }} aria-hidden="true" />
                  {selected && (
                    <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-fg)]">
                      <Check size={12} />
                    </span>
                  )}
                  <div className="relative z-10">
                    <div className="pr-4 text-base font-bold" style={{ fontFamily: theme.font.display }}>
                      {theme.label}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] opacity-70">{theme.description}</div>
                    {/* palette preview */}
                    <div className="mt-3 flex gap-1">
                      {Object.values(theme.colors)
                        .filter((c) => typeof c === 'string' && c.startsWith('#') && !Array.isArray(c))
                        .slice(0, 7)
                        .map((c, i) => (
                          <span key={i} className="h-2 flex-1 rounded-sm" style={{ background: c as string }} />
                        ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-wide opacity-60">
                      <span>{theme.font.display}</span>
                      <span>{theme.dark ? 'Dark' : 'Light'}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wide opacity-60">radius</span>
                      <span
                        className="inline-block border-2"
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: theme.radius,
                          borderColor: theme.dark ? theme.colors.foreground : theme.colors.muted,
                        }}
                      />
                      <span className="font-mono text-[11px]">{theme.radius}px</span>
                    </div>
                    <span className="pointer-events-none absolute -bottom-0.5 -right-0.5" aria-hidden="true">
                      <AnimatedMascot sprite={theme.sprite} size={24} />
                    </span>
                  </div>
                  {hoverId === theme.id && (
                    <div className="pointer-events-none absolute inset-0 z-20 p-3" aria-hidden="true">
                      <MiniDashboardPreview colors={theme.colors} sprite={theme.sprite} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </Section>

        {/* Controls */}
        <Section>
          <SectionHead title="Apply" kicker="Active theme" />
          <div className="grid grid-cols-3 gap-2">
            {DENSITIES.map((d) => (
              <DensityButton key={d.id} id={d.id} label={d.label} />
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">Font pairing</div>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(FONTS).map(([key, font]) => (
                <FontButton key={key} id={key} font={font} />
              ))}
            </div>
          </div>

          <button
            onClick={() => setTheme(preview)}
            className="mt-6 w-full rounded-lg bg-[var(--primary)] py-2.5 font-medium text-[var(--primary-fg)] transition hover:bg-[var(--primary-hover)]"
          >
            Use this theme
          </button>
        </Section>
      </div>
    </Layout>
  )
}

function DensityButton({ id, label }: { id: string; label: string }) {
  const { densityOverride, setDensityOverride } = useThemeStore()
  const active = densityOverride ?? undefined
  return (
    <button
      onClick={() => setDensityOverride(active === id ? null : (id as 'compact' | 'comfortable' | 'spacious'))}
      className={cn(
        'rounded-lg border py-2 text-xs',
        active === id ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]' : 'border-[var(--border)]',
      )}
    >
      {label}
    </button>
  )
}

function FontButton({ id, font }: { id: string; font: { label: string; display: string } }) {
  const { fontOverride, setFontOverride } = useThemeStore()
  const active = (fontOverride ?? undefined) === id
  return (
    <button
      onClick={() => setFontOverride(active ? null : id)}
      className={cn(
        'rounded-lg border px-3 py-2 text-left',
        active ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)]',
      )}
    >
      <div className="text-sm" style={{ fontFamily: font.display }}>
        {font.label}
      </div>
    </button>
  )
}