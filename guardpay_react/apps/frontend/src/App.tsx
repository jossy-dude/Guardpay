import { lazy, Suspense, useEffect } from 'react'
import { MotionConfig } from 'framer-motion'
import { HashRouter, Route, FallbackRoute, Link } from '@/lib/router'
import { ThemeEngine } from '@/features/theming/ThemeEngine'
import { ToastProvider } from '@/components/toast/Toast'
import { ReminderWatcher } from '@/components/reminders/ReminderWatcher'
import { Header } from '@/components/layout/Header'
import { LockScreen } from '@/components/auth/LockScreen'
import { useAuthStore } from '@/features/auth/authStore'
import { DashboardPage } from '@/pages/DashboardPage'
import { LeaderboardPage } from '@/pages/LeaderboardPage'
import { RecordsPage } from '@/pages/RecordsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { RemindersPage } from '@/pages/RemindersPage'
import { DataPage } from '@/pages/DataPage'
import { ResidentPage } from '@/pages/ResidentPage'
import { AvatarPicker } from '@/components/shared/AvatarPicker'

// Lazy-loaded: heavier pages (charts + export libs) load on demand, not on startup.
const AnalyticsExportsPage = lazy(() => import('@/pages/AnalyticsExportsPage'))

function PageFallback() {
  return <div className="py-20 text-center text-[var(--muted)]">Loading…</div>
}

function NotFound() {
  return (
    <div className="animate-in flex flex-col items-center justify-center py-24 text-center">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">404</div>
      <h2 className="mt-1 font-display text-3xl font-semibold">Page not found</h2>
      <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
        That page isn&apos;t in this edition of the ledger. Let&apos;s get you back to the masthead.
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-colors hover:bg-[var(--primary-hover)]"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}

function App() {
  const checkAuth = useAuthStore((s) => s.check)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <HashRouter>
      <MotionConfig reducedMotion="user">
        <ThemeEngine />
        <ToastProvider />
        <ReminderWatcher />
      <LockScreen />
      <div className="min-h-screen w-full">
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1"
          style={{ background: 'linear-gradient(90deg, var(--primary), var(--accent))' }}
        />
        <main className="mx-auto max-w-7xl px-4 py-5 md:px-6">
        <Header />
        <Route path="/">
          <DashboardPage />
        </Route>
        <Route path="/analytics">
          <Suspense fallback={<PageFallback />}>
            <AnalyticsExportsPage />
          </Suspense>
        </Route>
        <Route path="/leaderboard">
          <LeaderboardPage />
        </Route>
        <Route path="/ledger">
          <RecordsPage />
        </Route>
        <Route path="/settings">
          <SettingsPage />
        </Route>
        <Route path="/reminders">
          <RemindersPage />
        </Route>
        <Route path="/data">
          <DataPage />
        </Route>
        <Route path="/resident">
          <ResidentPage />
        </Route>
        <FallbackRoute knownPaths={['/', '/analytics', '/leaderboard', '/ledger', '/settings', '/reminders', '/data', '/resident']}>
          <NotFound />
        </FallbackRoute>
        </main>
      </div>
      <AvatarPicker />
      </MotionConfig>
    </HashRouter>
  )
}

export default App