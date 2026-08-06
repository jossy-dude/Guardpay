'use client'

import { useMemo, useState } from 'react'
import {
  Bug,
  Brush,
  Check,
  FileJson,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Link2,
  Settings as SettingsIcon,
  ShieldCheck,
  Volume2,
} from 'lucide-react'
import { useDataStore } from '@/features/payments/dataStore'
import { useAuthStore } from '@/features/auth/authStore'
import { api } from '@/lib/api'
import { Layout, Section, SectionHead } from '@/components/layout/Layout'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useSaveSettings } from '@/lib/hooks'
import { useSoundStore, useSound, SOUND_CREDITS } from '@/hooks/useSound'
import { cn } from '@/lib/cn'
import { toastError, toastSuccess } from '@/components/toast/store'
import type { MascotSpriteKey, Settings, ThemeId } from '@/lib/types'
import { THEME_LIST, useThemeStore, FONTS, resolveTheme, type ThemeDefinition } from '@/features/theming/themes'
import { AnimatedMascot } from '@/components/shared/AnimatedMascot'
import { ResidentAvatar } from '@/components/shared/ResidentAvatar'
import { buildExportRows, exportCSV, exportJSON, exportXLSX, stampName } from '@/features/exports/exports'
import { buildJsonBackup } from '@/features/exports/exports'
import { buildReportData } from '@/features/exports/reports'
import type { ReportTemplate } from '@/features/exports/reports'
import { PaperPreview, ReportTemplatePicker } from '@/components/exports/PaperPreview'
import { currentMonthKey } from '@/lib/utils'

type TabId = 'general' | 'appearance' | 'security' | 'sound' | 'export' | 'integrations' | 'diagnostics' | 'developer'

const TABS: { id: TabId; label: string; icon: typeof SettingsIcon }[] = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'appearance', label: 'Appearance & Themes', icon: Brush },
  { id: 'security', label: 'Security & PIN', icon: KeyRound },
  { id: 'sound', label: 'Sounds & Credits', icon: Volume2 },
  { id: 'export', label: 'Backup & Export', icon: FileText },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'diagnostics', label: 'Diagnostics', icon: Bug },
  { id: 'developer', label: 'Developer', icon: ShieldCheck },
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

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('general')

  return (
    <Layout>
      <SectionHead
        title="Settings"
        kicker="The Ledger"
        right={
          <nav role="tablist" className="flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  tab === t.id ? 'bg-[var(--primary)] text-[var(--primary-fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]',
                )}
              >
                <t.icon size={13} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </nav>
        }
      />

      {tab === 'general' && <GeneralTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'sound' && <SoundsTab />}
      {tab === 'export' && <ExportTab />}
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'diagnostics' && <DiagnosticsTab />}
      {tab === 'developer' && <DeveloperTab />}
    </Layout>
  )
}

/* ---------------- General ---------------- */

function GeneralTab() {
  const settings = useDataStore((s) => s.settings)
  const save = useSaveSettings()
  const [draft, setDraft] = useState<Settings>(settings)
  const [saved, setSaved] = useState(false)

  const update = (patch: Partial<Settings>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setSaved(false)
  }

  const onSave = () => {
    save.mutate(
      {
        neighborhood_name: draft.neighborhoodName,
        currency: draft.currency,
        due_day: draft.dueDay,
        guard_name: draft.guardName,
        guard_salary: draft.guardSalary,
        backup_before_changes: draft.backupBeforeChanges,
        default_fee: draft.defaultFee,
        guard_account_suffix: draft.guardAccountSuffix,
        calendar_mode: draft.calendarMode,
        month_language: draft.monthLanguage,
        heatmap_shape: draft.heatmapShape,
      },
      { onSuccess: () => setSaved(true) },
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section>
          <SectionHead title="Neighborhood" kicker="Who runs this ledger" />
          <Field label="Neighborhood name">
            <Input value={draft.neighborhoodName} onChange={(e) => update({ neighborhoodName: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency">
              <Input value={draft.currency} maxLength={6} onChange={(e) => update({ currency: e.target.value })} />
            </Field>
            <Field label="Due day of month">
              <Input
                type="number"
                min={1}
                max={28}
                value={draft.dueDay}
                onChange={(e) => update({ dueDay: Number(e.target.value) || 5 })}
              />
            </Field>
          </div>
          <Field label="Default monthly fee">
            <Input
              type="number"
              min={0}
              value={draft.defaultFee}
              onChange={(e) => update({ defaultFee: Number(e.target.value) || 0 })}
            />
          </Field>
        </Section>

        <Section>
          <SectionHead title="Guard" kicker="Settlement" />
          <Field label="Guard name">
            <Input value={draft.guardName} onChange={(e) => update({ guardName: e.target.value })} />
          </Field>
          <Field label="Monthly salary">
            <Input
              type="number"
              min={0}
              value={draft.guardSalary}
              onChange={(e) => update({ guardSalary: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Guard account (last digits)">
            <Input
              value={draft.guardAccountSuffix}
              maxLength={6}
              onChange={(e) => update({ guardAccountSuffix: e.target.value })}
            />
          </Field>
        </Section>
      </div>

      <div className="mt-4">
        <Section>
          <SectionHead title="Calendar" kicker="Gregorian or Ethiopian" />
          <div className="mb-3">
            <div className="mb-1 block text-xs font-medium text-[var(--muted)]">Month display</div>
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1">
              <button
                type="button"
                onClick={() => update({ calendarMode: 'gregorian' })}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  draft.calendarMode === 'gregorian'
                    ? 'bg-[var(--primary)] text-[var(--primary-fg)]'
                    : 'text-[var(--muted)] hover:text-[var(--fg)]',
                )}
              >
                Gregorian
              </button>
              <button
                type="button"
                onClick={() => update({ calendarMode: 'ethiopian' })}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  draft.calendarMode === 'ethiopian'
                    ? 'bg-[var(--primary)] text-[var(--primary-fg)]'
                    : 'text-[var(--muted)] hover:text-[var(--fg)]',
                )}
              >
                Ethiopian
              </button>
            </div>
          </div>
          {draft.calendarMode === 'ethiopian' && (
            <ToggleRow
              label="Amharic month names"
              desc="Show Ethiopian months in Ge'ez script (ሰኔ) instead of English (Sene)."
              checked={draft.monthLanguage === 'amharic'}
              onChange={(v) => update({ monthLanguage: v ? 'amharic' : 'english' })}
            />
          )}
          <ToggleRow
            label="Square calendar tiles"
            desc="Layered raised tiles on the dashboard payment calendar instead of flat rounded dots."
            checked={draft.heatmapShape === 'square'}
            onChange={(v) => update({ heatmapShape: v ? 'square' : 'rounded' })}
          />
        </Section>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
        {saved && <span style={{ color: 'var(--success)' }}>Saved ✓</span>}
        {save.isError && <span style={{ color: 'var(--danger)' }}>Failed to save — check server</span>}
      </div>
    </>
  )
}

/* ---------------- Appearance & Themes ---------------- */

function AppearanceTab() {
  const themeId = useThemeStore((s) => s.themeId)
  const setTheme = useThemeStore((s) => s.setTheme)
  const fontOverride = useThemeStore((s) => s.fontOverride)
  const setFontOverride = useThemeStore((s) => s.setFontOverride)
  const densityOverride = useThemeStore((s) => s.densityOverride)
  const setDensityOverride = useThemeStore((s) => s.setDensityOverride)
  const radiusOverride = useThemeStore((s) => s.radiusOverride)
  const setRadiusOverride = useThemeStore((s) => s.setRadiusOverride)
  const resetOverrides = useThemeStore((s) => s.resetOverrides)
  const resolved = resolveTheme()
  const overridden = !!fontOverride || !!densityOverride || radiusOverride !== null
  const [hoverId, setHoverId] = useState<ThemeId | null>(null)

  const densities = ['compact', 'comfortable', 'spacious'] as const
  const radii = [0, 6, 12, 16] as const

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Section className="lg:col-span-2">
        <SectionHead
          title="Edition themes"
          kicker="Pick your paper"
          right={
            overridden && (
              <Button variant="ghost" size="sm" onClick={resetOverrides}>
                Reset overrides
              </Button>
            )
          }
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {THEME_LIST.map((t) => {
            const active = themeId === t.id && !overridden
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                onMouseEnter={() => setHoverId(t.id)}
                onMouseLeave={() => setHoverId(null)}
                className={cn(
                  'group relative overflow-hidden rounded-[var(--radius)] border p-3 text-left transition-all',
                  active ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/40' : 'border-[var(--border)] hover:border-[var(--primary)]/50',
                )}
                style={{
                  background: `color-mix(in srgb, ${t.colors.card} 78%, transparent)`,
                  color: t.colors.foreground,
                  backdropFilter: 'blur(6px)',
                }}
              >
                <span
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, color-mix(in srgb, ${t.colors.primary} 26%, transparent), color-mix(in srgb, ${t.colors.accent} 22%, transparent))`,
                  }}
                  aria-hidden="true"
                />
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'color-mix(in srgb, #ffffff 45%, transparent)' }} aria-hidden="true" />
                {active && (
                  <span className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-fg)]">
                    <Check size={12} />
                  </span>
                )}
                <div className="relative z-10">
                  <div className="pr-4 text-sm font-semibold">{t.label}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] opacity-70">{t.description}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-60">
                    <span className="rounded bg-black/10 px-1 py-0.5">{t.family}</span>
                    <span className="rounded bg-black/10 px-1 py-0.5">{t.font.label}</span>
                    {t.texture && <span className="rounded bg-black/10 px-1 py-0.5">{t.texture}</span>}
                  </div>
                  <span className="pointer-events-none absolute -bottom-0.5 -right-0.5" aria-hidden="true">
                    <AnimatedMascot sprite={t.sprite} size={24} />
                  </span>
                </div>
                {hoverId === t.id && (
                  <div className="pointer-events-none absolute inset-0 z-20 p-3" aria-hidden="true">
                    <MiniDashboardPreview colors={t.colors} sprite={t.sprite} />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </Section>

      <div className="space-y-4">
        <Section>
          <SectionHead title="Typography" kicker="Typeface pairing" />
          <div className="flex flex-wrap gap-2">
            {Object.entries(FONTS).map(([key, pair]) => (
              <button
                key={key}
                onClick={() => setFontOverride(fontOverride === key ? null : key)}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs transition',
                  fontOverride === key
                    ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]'
                    : 'border-[var(--border)] hover:border-[var(--primary)]/50',
                )}
              >
                {pair.label}
              </button>
            ))}
          </div>
        </Section>

        <Section>
          <SectionHead title="Density" kicker="Spacing rhythm" />
          <div className="flex flex-wrap gap-2">
            {densities.map((d) => (
              <button
                key={d}
                onClick={() => setDensityOverride(densityOverride === d ? null : d)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition',
                  densityOverride === d
                    ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]'
                    : 'border-[var(--border)] hover:border-[var(--primary)]/50',
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Section>

        <Section>
          <SectionHead title="Corner radius" kicker="How soft the edges" />
          <div className="flex flex-wrap gap-2">
            {radii.map((r) => (
              <button
                key={r}
                onClick={() => setRadiusOverride(radiusOverride === r ? null : r)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
                  radiusOverride === r
                    ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]'
                    : 'border-[var(--border)] hover:border-[var(--primary)]/50',
                )}
              >
                {r}px
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Active: <span className="font-medium text-[var(--fg)]">{resolved.label}</span> · radius{' '}
            {resolved.radius}px · {resolved.density}.
          </p>
        </Section>

        <Section>
          <SectionHead title="Character" kicker="Your theme's resident" />
          <div className="flex items-center gap-4">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-[var(--radius)]"
              style={{ background: resolved.colors.secondary }}
            >
              <AnimatedMascot sprite={resolved.sprite} size={72} />
            </div>
            <div className="min-w-0">
              <div className="font-display text-base font-semibold leading-tight" style={{ fontFamily: resolved.font.display }}>
                {resolved.mascot.name}
              </div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{resolved.mascot.role}</div>
              <div className="mt-2 flex items-center gap-2">
                <ResidentAvatar house={{ id: 0, name: resolved.label, avatar: null }} size={26} />
                <span className="text-[11px] text-[var(--muted)]">Resident avatars are set per household — tap any avatar to customize it.</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Every theme gets its own mascot, matched to the current paper. Resident avatars by Pablo Stanley — Avataaars.
          </p>
        </Section>
      </div>
    </div>
  )
}

/* ---------------- Security & PIN ---------------- */

function SecurityTab() {
  const settings = useDataStore((s) => s.settings)
  const save = useSaveSettings()
  const [enabled, setEnabled] = useState(settings.backupBeforeChanges)
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const muted = useSoundStore((s) => s.muted)
  const setMuted = useSoundStore((s) => s.setMuted)
  const pinEnabled = useAuthStore((s) => s.pinEnabled)
  const pinBusy = useAuthStore((s) => s.loading)
  const setPinAction = useAuthStore((s) => s.setPin)
  const disablePin = useAuthStore((s) => s.disablePin)
  const refreshAuth = useAuthStore((s) => s.check)

  const saveProtection = () => {
    save.mutate(
      {
        neighborhood_name: settings.neighborhoodName,
        currency: settings.currency,
        due_day: settings.dueDay,
        guard_name: settings.guardName,
        guard_salary: settings.guardSalary,
        backup_before_changes: enabled,
        default_fee: settings.defaultFee,
        guard_account_suffix: settings.guardAccountSuffix,
      },
      { onSuccess: () => toastSuccess('Protection preferences saved') },
    )
  }

  const enablePin = async () => {
    if (pin.length < 4) {
      toastError('PIN too short', 'Use at least 4 digits.')
      return
    }
    if (pin !== pinConfirm) {
      toastError('PINs do not match', 'Confirm the same PIN in both fields.')
      return
    }
    try {
      await setPinAction(pin)
      setPin('')
      setPinConfirm('')
      toastSuccess('PIN configured', 'GuardPay will now lock when you close the app.')
    } catch (e) {
      toastError('Could not set PIN', (e as Error).message)
    }
  }

  const removePin = async () => {
    try {
      await disablePin(pin)
      setPin('')
      setPinConfirm('')
      toastSuccess('PIN disabled', 'GuardPay is now open on this device.')
    } catch (e) {
      toastError('Could not disable PIN', (e as Error).message)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section>
        <SectionHead title="Device PIN" kicker="Lock the app" />
        {pinEnabled ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">
              A PIN is enabled. GuardPay locks until you enter it — the session cookie lasts 30 days.
            </p>
            <Field label="Current PIN">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                aria-label="Current PIN"
              />
            </Field>
            <Button variant="danger" onClick={removePin} disabled={pinBusy || pin.length < 4}>
              <KeyRound size={15} className="mr-1.5" /> Disable PIN
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-[var(--muted)]">
              Set a 4–6 digit PIN to lock GuardPay on this device. Your PIN is verified against the app backend.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="New PIN">
                <Input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
              </Field>
              <Field label="Confirm PIN">
                <Input type="password" inputMode="numeric" maxLength={6} value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
              </Field>
            </div>
            <Button className="mt-1" variant="secondary" onClick={enablePin} disabled={pinBusy}>
              <KeyRound size={15} className="mr-1.5" /> {pinBusy ? 'Saving…' : 'Set PIN'}
            </Button>
          </>
        )}
        <button
          type="button"
          className="mt-2 text-xs text-[var(--muted)] underline-offset-2 hover:underline"
          onClick={refreshAuth}
        >
          Refresh lock status
        </button>
      </Section>

      <Section>
        <SectionHead title="Data protection" kicker="Before destructive actions" />
        <ToggleRow
          label="Backup before changes"
          desc="Snap a JSON backup automatically before deleting houses or making bulk edits."
          checked={enabled}
          onChange={setEnabled}
        />
        <div className="mt-3">
          <ToggleRow
            label="Sound effects"
            desc="Toggle the themed UI sounds (ticks, chimes, alerts) on this device."
            checked={!muted}
            onChange={(v) => setMuted(!v)}
          />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={saveProtection} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save preferences'}
          </Button>
        </div>
      </Section>
    </div>
  )
}

/* ---------------- Sounds & Credits ---------------- */

function SoundsTab() {
  const muted = useSoundStore((s) => s.muted)
  const volume = useSoundStore((s) => s.volume)
  const setMuted = useSoundStore((s) => s.setMuted)
  const setVolume = useSoundStore((s) => s.setVolume)
  const { preview } = useSound()

  const actions: { key: 'toggle' | 'paid' | 'error' | 'hover'; label: string; desc: string }[] = [
    { key: 'toggle', label: 'Toggle', desc: 'Flipping a payment status' },
    { key: 'paid', label: 'Paid', desc: 'Settling a debt in full' },
    { key: 'error', label: 'Error', desc: 'Something went wrong' },
    { key: 'hover', label: 'Hover', desc: 'Pointer over an element' },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Section>
        <SectionHead title="Sound" kicker="Themed on this device" />
        <ToggleRow
          label="Sound effects"
          desc="Master switch for all UI sounds (ticks, chimes, alerts)."
          checked={!muted}
          onChange={(v) => setMuted(!v)}
        />
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">Volume</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Sound volume"
            className="w-full accent-[var(--primary)]"
          />
          <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]">
            <span>Silent</span>
            <span>{Math.round(volume * 100)}%</span>
          </div>
        </div>
      </Section>

      <Section>
        <SectionHead title="Preview" kicker="Tap to audition" />
        <p className="mb-3 text-sm text-[var(--muted)]">
          Each action maps to a themed sound. Preview them here — the active theme decides the exact sound.
        </p>
        <div className="space-y-2">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => preview(a.key)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-left transition hover:border-[var(--primary)]/50 hover:bg-[var(--secondary)]/40"
            >
              <span>
                <span className="block text-sm font-medium">{a.label}</span>
                <span className="block text-xs text-[var(--muted)]">{a.desc}</span>
              </span>
              <Volume2 size={16} className="shrink-0 text-[var(--muted)]" />
            </button>
          ))}
        </div>
      </Section>

      <Section className="lg:col-span-2">
        <SectionHead title="Sound credits" kicker="Bundled locally · zero network calls" />
        <div className="space-y-2 text-sm">
          {SOUND_CREDITS.map((c) => (
            <div key={c.pack} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2">
              <span className="font-medium">{c.pack}</span>
              <span className="text-[var(--muted)]">{c.author}</span>
              <span className="font-mono text-xs" style={{ color: 'var(--success)' }}>
                {c.license}
              </span>
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--primary)] underline-offset-2 hover:underline"
              >
                {c.url.replace('https://', '')}
              </a>
            </div>
          ))}
          <p className="pt-1 text-xs text-[var(--muted)]">
            All sound files ship inside this app and play from disk — nothing is fetched from the network at runtime.
          </p>
        </div>
      </Section>
    </div>
  )
}

/* ---------------- Backup & Export ---------------- */

function ExportTab() {
  const houses = useDataStore((s) => s.houses)
  const payments = useDataStore((s) => s.payments)
  const guardPayments = useDataStore((s) => s.guardPayments)
  const settings = useDataStore((s) => s.settings)
  const [template, setTemplate] = useState<ReportTemplate>('monthly')
  const [busy, setBusy] = useState<string | null>(null)

  const month = currentMonthKey()
  const rows = useMemo(() => buildExportRows(houses, payments, month), [houses, payments, month])
  const data = useMemo(
    () => buildReportData(houses, payments, guardPayments, settings),
    [houses, payments, guardPayments, settings],
  )

  const run = async (key: string, fn: () => void | Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      toastError('Export failed', err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Houses" value={rows.length} />
        <Stat label="Paid" value={data.summary.paidCount} />
        <Stat label="Collected" value={data.summary.collected.toLocaleString()} currency={settings.currency} />
        <Stat label="Expected" value={data.summary.expected.toLocaleString()} currency={settings.currency} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section>
          <SectionHead title="Spreadsheet" kicker={`${rows.length} rows · ${month}`} />
          <div className="space-y-2">
            <Button
              className="w-full justify-start"
              variant="secondary"
              disabled={!!busy}
              onClick={() => run('xlsx', () => exportXLSX(rows, settings, stampName('guardpay-ledger', 'xlsx')))}
            >
              <FileSpreadsheet size={16} /> {busy === 'xlsx' ? 'Exporting…' : 'Download XLSX'}
            </Button>
            <Button
              className="w-full justify-start"
              variant="secondary"
              disabled={!!busy}
              onClick={() => run('csv', () => exportCSV(rows, settings, stampName('guardpay-ledger', 'csv')))}
            >
              <FileText size={16} /> Download CSV (UTF-8)
            </Button>
          </div>
        </Section>

        <Section>
          <SectionHead title="Full backup" kicker="JSON — everything" />
          <Button
            className="w-full justify-start"
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              run('json', () =>
                exportJSON(buildJsonBackup(houses, payments, guardPayments, settings), stampName('guardpay-backup', 'json')),
              )
            }
          >
            <FileJson size={16} /> Download full backup
          </Button>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Includes houses, payments, guard payments and settings. Restore is done from the Data page.
          </p>
        </Section>

        <Section>
          <SectionHead title="Report" kicker="5 templates · live preview" />
          <p className="text-sm text-[var(--muted)]">
            Pick a report edition below, inspect the live preview on the paper, then hit{' '}
            <b>Download PDF</b> in the studio pane. Renders a crisp A4 snapshot of the document.
          </p>
        </Section>
      </div>

      <Section className="mt-4">
        <SectionHead title="Report studio" kicker="The Ledger editions" />
        <ReportTemplatePicker value={template} onChange={setTemplate} />
        <PaperPreview className="mt-4" template={template} data={data} withToolbar />
      </Section>
    </>
  )
}

/* ---------------- Integrations ---------------- */

function IntegrationsTab() {
  const cards = [
    { name: 'Telegram bot', desc: 'Push collection reminders & monthly summaries to a group chat.', connected: false },
    { name: 'Export bridge', desc: 'Auto-upload XLSX backups to a connected drive.', connected: false },
    { name: 'SMS gateway', desc: 'Send polite reminder SMS to households that are overdue.', connected: false },
  ]
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {cards.map((c) => (
        <Section key={c.name}>
          <SectionHead title={c.name} kicker={c.connected ? 'Connected' : 'Not connected'} />
          <p className="text-sm text-[var(--muted)]">{c.desc}</p>
          <Button className="mt-3" variant="outline" disabled>
            <Link2 size={15} className="mr-1.5" />
            Coming soon
          </Button>
        </Section>
      ))}
    </div>
  )
}

/* ---------------- Diagnostics ---------------- */

function DiagnosticsTab() {
  const houses = useDataStore((s) => s.houses)
  const payments = useDataStore((s) => s.payments)
  const guardPayments = useDataStore((s) => s.guardPayments)
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'warn'>('idle')
  const [checks, setChecks] = useState<string[]>([])

  const items = [
    { label: 'Houses', value: String(houses.length) },
    { label: 'Payments recorded', value: String(payments.length) },
    { label: 'Guard settlements', value: String(guardPayments.length) },
    { label: 'Data version', value: 'v2' },
  ]

  const runCheck = async () => {
    setStatus('checking')
    setChecks([])
    const results: string[] = []
    try {
      const health = await api.get<{ ok: boolean; version: string }>('/health')
      results.push(health.ok ? `API reachable (v${health.version})` : 'API unreachable')
      const state = await api.get<{ houses: unknown[]; payments: unknown[]; guard_payments: unknown[] }>('/state')
      const h = state.houses?.length ?? 0
      const p = state.payments?.length ?? 0
      const g = state.guard_payments?.length ?? 0
      if (h === 0) results.push('No households recorded yet')
      else if (p === 0) results.push('No payments recorded yet')
      else results.push(`${h} households · ${p} payments · ${g} guard settlements`)
      const ok = health.ok && h > 0
      setStatus(ok ? 'ok' : 'warn')
      setChecks(results)
      if (ok) toastSuccess('Diagnostics complete — all systems nominal')
      else toastError('Diagnostics warning', 'Review the check results below.')
    } catch (e) {
      setStatus('warn')
      setChecks(['Backend not reachable — ' + (e as Error).message])
      toastError('Diagnostics failed', 'Could not reach the GuardPay backend.')
    }
  }

  return (
    <Section>
      <SectionHead
        title="Diagnostics"
        kicker="Ledger health"
        right={
          <Button variant="secondary" size="sm" onClick={runCheck} disabled={status === 'checking'}>
            {status === 'checking' ? 'Checking…' : 'Run checks'}
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((i) => (
          <div key={i.label} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="text-xs text-[var(--muted)]">{i.label}</div>
            <div className="text-xl font-bold">{i.value}</div>
          </div>
        ))}
      </div>
      {checks.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {checks.map((c) => (
            <li key={c} className="flex items-center gap-2 text-[var(--muted)]">
              <span className="size-1.5 rounded-full" style={{ background: status === 'ok' ? 'var(--success)' : 'var(--danger)' }} />
              {c}
            </li>
          ))}
        </ul>
      )}
      {status === 'ok' && (
        <p className="mt-3 text-sm" style={{ color: 'var(--success)' }}>
          All checks passed — the ledger is healthy.
        </p>
      )}
    </Section>
  )
}

/* ---------------- Developer ---------------- */

function DeveloperTab() {
  return (
    <Section>
      <SectionHead title="Developer" kicker="Under the hood" />
      <div className="space-y-2 text-sm">
        <Row label="Frontend" value="React 18 · Vite · Tailwind" />
        <Row label="State" value="Zustand + React Query" />
        <Row label="API" value="FastAPI · SQLite" />
        <Row label="Rendering" value="Custom vector mascots + newspaper editions" />
      </div>
      <p className="mt-4 text-xs text-[var(--muted)]">
        GuardPay v2 — the neighborhood payment ledger. Settings stored server-side; theme & PIN live on this device.
      </p>
    </Section>
  )
}

/* ---------------- Small pieces ---------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium text-[var(--muted)]">{label}</label>
      {children}
    </div>
  )
}

function Stat({ label, value, currency }: { label: string; value: string | number; currency?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="text-xl font-bold">
        {typeof value === 'number' && currency && (
          <span className="mr-1 text-sm opacity-70">{currency}</span>
        )}
        {String(value)}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-lg border border-[var(--border)] p-3 text-left transition hover:border-[var(--primary)]/50"
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-[var(--muted)]">{desc}</span>
      </span>
      <span
        className={cn(
          'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
          checked ? 'bg-[var(--primary)]' : 'bg-[var(--border)]',
        )}
      >
        <span
          className={cn(
            'h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] pb-2">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export default SettingsPage