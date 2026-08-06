'use client'

import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { KeyRound, Loader2, Lock } from 'lucide-react'
import { useAuthStore } from '@/features/auth/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Full-screen gate shown while a device PIN is enabled and the current session
 * is not authenticated. Submitting the correct PIN unlocks the app for the
 * session (30-day cookie, refreshed automatically by the API).
 */
export function LockScreen() {
  const pinEnabled = useAuthStore((s) => s.pinEnabled)
  const authenticated = useAuthStore((s) => s.authenticated)
  const loading = useAuthStore((s) => s.loading)
  const login = useAuthStore((s) => s.login)
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const locked = pinEnabled && !authenticated
  if (!locked) return null

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (pin.length < 4 || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await login(pin)
      setPin('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg)] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-6"
        data-surface
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-fg)]">
            <Lock size={18} />
          </div>
          <div>
            <div className="font-display text-lg font-semibold leading-tight">GuardPay is locked</div>
            <div className="text-xs text-[var(--muted)]">Enter your PIN to continue</div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            type="password"
            inputMode="numeric"
            autoFocus
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''))
              setError(null)
            }}
            placeholder="••••••"
            aria-label="Device PIN"
            disabled={submitting}
          />
          {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
          <Button type="submit" className="w-full" disabled={pin.length < 4 || submitting || loading}>
            {submitting || loading ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
            {submitting ? 'Unlocking…' : 'Unlock'}
          </Button>
        </form>
      </motion.div>
    </div>
  )
}
