'use client'

import { forwardRef, useMemo, useRef, useState } from 'react'
import { FileText, Loader2, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { toastError } from '@/components/toast/store'
import { currentMonthKey } from '@/lib/utils'
import { exportPaperPdf, type PdfExportOptions } from '@/features/exports/pdf'
import type { ReportData, ReportTemplate } from '@/features/exports/reports'
import { REPORT_TEMPLATES, renderReport } from '@/features/exports/reports'

interface Props {
  template: ReportTemplate
  data: ReportData
  className?: string
  /** Show a slim toolbar with title editing + Download PDF button. */
  withToolbar?: boolean
  pdfOptions?: PdfExportOptions
  title?: string
  subtitle?: string
  onTitleChange?: (s: string) => void
  onSubtitleChange?: (s: string) => void
}

const ZOOMS = [
  { label: 'Fit', value: 1 },
  { label: '110%', value: 1.1 },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5 },
]

export const PaperPreview = forwardRef<HTMLDivElement, Props>(function PaperPreview(
  { template, data, className, withToolbar, pdfOptions, title, subtitle, onTitleChange, onSubtitleChange },
  ref,
) {
  const nodeRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(1)
  const html = useMemo(() => renderReport(template, data, { title, subtitle }), [template, data, title, subtitle])

  const setRefs = (el: HTMLDivElement | null) => {
    nodeRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  const download = async () => {
    setBusy(true)
    try {
      if (nodeRef.current) {
        await exportPaperPdf(nodeRef.current, `guardpay-${template}-${currentMonthKey()}.pdf`, pdfOptions)
      }
    } catch (err) {
      toastError('Export failed', err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      {withToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={title ?? ''}
              onChange={(e) => onTitleChange?.(e.target.value)}
              placeholder={`${REPORT_TEMPLATES.find((t) => t.id === template)?.name ?? 'Report'} title`}
              aria-label="Report title"
              className="h-8 max-w-56"
            />
            <Input
              value={subtitle ?? ''}
              onChange={(e) => onSubtitleChange?.(e.target.value)}
              placeholder="Subtitle (optional)"
              aria-label="Report subtitle"
              className="h-8 max-w-56"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-1.5 py-1">
              <ZoomIn size={13} className="ml-0.5 text-[var(--muted)]" />
              {ZOOMS.map((z) => (
                <button
                  key={z.value}
                  onClick={() => setZoom(z.value)}
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                    zoom === z.value ? 'bg-[var(--primary)] text-[var(--primary-fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]',
                  )}
                >
                  {z.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={download} disabled={busy}>
              {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <FileText size={14} className="mr-1.5" />}
              {busy ? 'Rendering…' : 'Download PDF'}
            </Button>
          </div>
        </div>
      )}
      <div className="paper-scroll overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4">
        <div style={{ width: `${540 * zoom}px`, maxWidth: '100%', margin: '0 auto' }}>
          <div
            ref={setRefs}
            className="paper-doc"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  )
})

/** Horizontal list of the 5 report template choices. */
export function ReportTemplatePicker({
  value,
  onChange,
}: {
  value: ReportTemplate
  onChange: (t: ReportTemplate) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {REPORT_TEMPLATES.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'rounded-[var(--radius)] border p-2.5 text-left transition',
            value === t.id
              ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]'
              : 'border-[var(--border)] hover:border-[var(--primary)]/50',
          )}
        >
          <div className="text-sm font-semibold">{t.name}</div>
          <div className={cn('text-[11px]', value === t.id ? 'text-[var(--primary-fg)]/80' : 'text-[var(--muted)]')}>
            {t.desc}
          </div>
        </button>
      ))}
    </div>
  )
}
