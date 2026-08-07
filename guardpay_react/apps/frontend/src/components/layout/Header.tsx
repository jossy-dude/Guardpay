import { Settings, Palette, Bell, UserRound, Volume2, VolumeX } from 'lucide-react'
import { Link } from '@/lib/router'
import { useDataStore } from '@/features/payments/dataStore'
import { resolveTheme, useThemeStore } from '@/features/theming/themes'
import { AnimatedMascot } from '@/components/shared/AnimatedMascot'
import { InlineEdit } from '@/components/shared/overlay/InlineEdit'
import { useSaveSettings } from '@/lib/hooks'
import { useSoundStore } from '@/hooks/useSound'

const NAV = [
  { to: '/', label: 'Dashboard', icon: null },
  { to: '/analytics', label: 'Analytics & Export', icon: null },
  { to: '/leaderboard', label: 'Leaderboard', icon: null },
  { to: '/ledger', label: 'Ledger', icon: null },
]

export function Header() {
  const settings = useDataStore((s) => s.settings)
  const reminders = useDataStore((s) => s.reminders)
  const activeReminders = reminders.filter((r) => r.isActive).length
  const themeId = useThemeStore((s) => s.themeId)
  const saveSettings = useSaveSettings()
  const muted = useSoundStore((s) => s.muted)
  const setMuted = useSoundStore((s) => s.setMuted)

  const { sprite } = resolveTheme()

  const onEditName = (next: string) => {
    saveSettings.mutate({ neighborhood_name: next })
  }

  return (
    <header className="mb-6 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]">
      {/* Masthead row */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-[var(--density-x)] py-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[var(--radius)] bg-[var(--secondary)]"
            title={`${themeId}'s mascot`}
          >
            <AnimatedMascot sprite={sprite} size={44} />
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
              <InlineEdit
                value={settings.neighborhoodName || 'Neighborhood Security Fund'}
                onSave={onEditName}
                ariaLabel="Neighborhood name"
                allowContextEdit
              />
            </div>
            <div className="font-display text-xl font-bold leading-tight">
              The <span style={{ color: 'var(--primary)' }}>Ledger</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted(!muted)}
            className="rounded-lg p-2 hover:bg-[var(--border)]"
            aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
            title={muted ? 'Sounds muted — click to unmute' : 'Sounds on — click to mute'}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <span className="hidden text-xs text-[var(--muted)] sm:block">
            {settings.currency || 'ETB'}
          </span>
          <Link
            to="/settings"
            className="rounded-lg p-2 hover:bg-[var(--border)]"
            aria-label="Settings"
          >
            <Settings size={18} />
          </Link>
          <Link
            to="/settings?tab=appearance"
            className="rounded-lg p-2 hover:bg-[var(--border)]"
            aria-label="Settings & appearance"
          >
            <Palette size={18} />
          </Link>
          <Link
            to="/resident"
            className="rounded-lg p-2 hover:bg-[var(--border)]"
            aria-label="Resident self-service"
          >
            <UserRound size={18} />
          </Link>
          <Link
            to="/reminders"
            className="relative rounded-lg p-2 hover:bg-[var(--border)]"
            aria-label="Reminders"
          >
            <Bell size={18} />
            {activeReminders > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
                {activeReminders}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Nav row */}
      <nav className="flex gap-1 border-t border-[var(--border)] px-2 py-1.5">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted-fg)] transition-colors hover:text-[var(--fg)]"
            activeClassName="!text-[var(--fg)] bg-[var(--border)]"
          >
            {item.label}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-1 pr-1">
          <span className="rounded-md bg-[var(--border)] px-2 py-1 font-mono text-xs">
            {themeId}
          </span>
        </div>
      </nav>
    </header>
  )
}