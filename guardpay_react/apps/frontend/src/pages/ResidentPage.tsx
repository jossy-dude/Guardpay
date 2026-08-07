'use client'

import { useEffect, useState } from 'react'
import { KeyRound, Copy, Loader2, TriangleAlert } from 'lucide-react'
import { useDataStore } from '@/features/payments/dataStore'
import { Layout, Section, SectionHead } from '@/components/layout/Layout'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScoreDots, TierBadge } from '@/components/shared/animations'
import { usePublicLookup, usePublicStatus } from '@/lib/hooks'
import { toastSuccess } from '@/components/toast/store'
import { formatDate, calendarMonthLabel } from '@/lib/utils'

/** Deterministic code derivation — MUST match the backend (sha256 hexdigest[:8]). */
export async function houseAccessCode(houseNumber: string): Promise<string> {
  const data = new TextEncoder().encode(houseNumber)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 8)
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  ontime: { label: 'On time', tone: 'var(--success)' },
  unpaid: { label: 'Unpaid', tone: 'var(--danger)' },
  upcoming: { label: 'Upcoming', tone: 'var(--muted)' },
}

export function ResidentPage() {
  const houses = useDataStore((s) => s.houses)
  const settings = useDataStore((s) => s.settings)
  const [code, setCode] = useState('')
  const [submitted, setSubmitted] = useState('')

  const lookup = usePublicLookup(submitted, submitted.length >= 4)
  const status = usePublicStatus(lookup.data ? lookup.data.house_id : null, submitted)

  return (
    <Layout>
      <SectionHead title="Resident Self-Service" kicker="Check your record" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Lookup */}
        <Section>
          <SectionHead title="My status" kicker="Private by access code" />
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setSubmitted(code.trim())}
              placeholder="Enter your access code"
              className="font-mono"
              maxLength={16}
            />
            <Button onClick={() => setSubmitted(code.trim())} disabled={code.trim().length < 4}>
              Look up
            </Button>
          </div>

          {lookup.isError && (
            <p className="mt-3 text-sm text-[var(--danger)]">No payment record found for that code.</p>
          )}

          {status.data && !status.isError && (
            <div className="mt-4">
              <div className="rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold">{status.data.name}</div>
                    <div className="font-mono text-sm text-[var(--primary)]">House {status.data.house_number}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--muted)]">Fee / month</div>
                    <div className="text-lg font-bold">{status.data.fee.toLocaleString()}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MiniStat label="On-time rate" value={`${status.data.on_time_rate}%`} />
                  <MiniStat label="Current streak" value={`${status.data.current_streak} mo`} />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <ScoreDots score={status.data.reliability_score} size={16} />
                  <TierBadge tier={status.data.tier as HouseTier} />
                  <span className="text-sm text-[var(--muted-fg)]">{status.data.reliability_score}/100</span>
                </div>
              </div>

              {status.data.history.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">Recent months</div>
                  <div className="space-y-1">
                    {status.data.history
                      .slice(-6)
                      .map((m) => {
                        const s = STATUS_LABEL[m.status]
                        return (
                          <div key={m.month_key} className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-1.5 text-sm">
                            <span className="text-[var(--muted)]">{calendarMonthLabel(m.month_key, settings)}</span>
                            <span className="flex items-center gap-2">
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                style={{ color: s?.tone ?? 'inherit', background: 'color-mix(in srgb, var(--border) 35%, transparent)' }}
                              >
                                {s?.label ?? m.status}
                              </span>
                              <span className="font-mono text-xs text-[var(--muted)]">
                                {m.paid_date ? formatDate(m.paid_date) : '—'}
                              </span>
                            </span>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Code management (admin, LAN-only) */}
        <Section>
          <SectionHead title="Access codes" kicker="Share with residents" />
          <p className="mb-3 text-xs text-[var(--muted)]">
            Each household has a short code. Residents can look up only their own record.
          </p>
          <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {houses.filter((h) => h.active).length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted)]">No active households yet.</p>
            ) : (
              houses
                .filter((h) => h.active)
                .map((h) => (
                  <div key={h.id} className="flex items-center justify-between rounded-md border border-[var(--border)] px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{h.name}</div>
                      <div className="font-mono text-xs text-[var(--primary)]">House {h.houseNumber}</div>
                    </div>
                    <AccessCodeButton houseNumber={h.houseNumber} name={h.name} />
                  </div>
                ))
            )}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <KeyRound size={12} /> Codes are derived from house numbers and never stored.
          </p>
        </Section>
      </div>
    </Layout>
  )
}

type HouseTier = 'excellent' | 'reliable' | 'inconsistent' | 'at_risk'

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--border)]/40 p-2">
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  )
}

function AccessCodeButton({ houseNumber, name }: { houseNumber: string; name: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    setError(false)
    houseAccessCode(houseNumber)
      .then((c) => active && setCode(c))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [houseNumber])
  return (
    <button
      onClick={() => {
        if (!code) return
        navigator.clipboard?.writeText(code)
        toastSuccess('Copied', `${name} → ${code}`)
      }}
      className="flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-2.5 py-1.5 font-mono text-xs hover:bg-[var(--border)]"
    >
      {code ? (
        <Copy size={12} />
      ) : error ? (
        <TriangleAlert size={12} />
      ) : (
        <Loader2 size={12} className="animate-spin" />
      )}
      {error ? 'err' : (code ?? 'loading')}
    </button>
  )
}