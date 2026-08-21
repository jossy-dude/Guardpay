'use client'

import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

/** A4 page width at 96 CSS dpi. Capture at this width so the report maps
 *  1:1 onto the printed page (no upscale blur, margins translate exactly). */
const A4_PX = 794
const A5_PX = 559

export interface PdfExportOptions {
  pageSize?: 'a4' | 'a5'
  orientation?: 'portrait' | 'landscape'
  /** Optional capture scale override (defaults to a clamped crisp 3x). */
  scale?: number
}

/** Page width in px (96dpi) for each supported size. */
function pageWidthPx(size: PdfExportOptions['pageSize'] = 'a4'): number {
  return size === 'a5' ? A5_PX : A4_PX
}

/**
 * Snapshot a `.paper-doc` (or any) node to a PDF. Used by the report studio to
 * turn the live HTML preview into a crisp, printed file. Accepts either a
 * legacy numeric scale or an options object.
 */
export async function exportPaperPdf(
  element: HTMLElement,
  filename: string,
  opts?: number | PdfExportOptions,
) {
  const options: PdfExportOptions = typeof opts === 'number' ? { scale: opts } : (opts ?? {})
  const { pageSize = 'a4', orientation = 'portrait', scale: explicitScale } = options
  const targetWidth = pageWidthPx(pageSize)

  // Capture regardless of scroll position: bring the node into view and wait
  // for any webfonts to finish loading so text isn't clipped or mis-measured.
  element.scrollIntoView({ block: 'center' })
  await document.fonts.ready

  // Reflow the doc to true page width before snapshotting. The on-screen
  // preview is a narrower stand-in; widening it for the capture makes the
  // export fill the page edge-to-edge instead of being upscaled from a
  // small box (which is what blurred the text and broke table alignment).
  const prevWidth = element.style.width
  const prevMaxWidth = element.style.maxWidth
  element.style.width = `${targetWidth}px`
  element.style.maxWidth = 'none'

  // Derive a safe capture scale so tall reports never exceed browser canvas
  // limits (~16.7MP, 4096² practical). Default to 3x for crisp print text but
  // clamp to fit.
  const MAX_PX = 16000000
  const safeScale = Math.min(
    4096 / Math.max(element.scrollWidth, 1),
    Math.sqrt(MAX_PX / (Math.max(element.scrollWidth, 1) * Math.max(element.scrollHeight, 1))),
  )
  const scale = explicitScale ?? Math.min(3, safeScale)

  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale,
      useCORS: true,
      width: element.offsetWidth,
      height: element.offsetHeight,
      windowWidth: element.scrollWidth,
      windowHeight: Math.max(element.scrollHeight, window.innerHeight),
    })
  } finally {
    // Restore the preview layout whether the capture succeeded or threw.
    element.style.width = prevWidth
    element.style.maxWidth = prevMaxWidth
  }

  const pdf = new jsPDF({ orientation, unit: 'mm', format: pageSize })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW
  const imgH = (canvas.height * imgW) / canvas.width

  // PNG is lossless — crisp text, no JPEG blocking artifacts or 1px seams at
  // page-slice boundaries. Size is larger than JPEG but reports are modest.
  const dataUrl = canvas.toDataURL('image/png')

  let heightLeft = imgH
  let position = 0
  pdf.addImage(dataUrl, 'PNG', 0, position, imgW, imgH)
  heightLeft -= pageH
  while (heightLeft > 0) {
    position = heightLeft - imgH
    pdf.addPage()
    pdf.addImage(dataUrl, 'PNG', 0, position, imgW, imgH)
    heightLeft -= pageH
  }
  pdf.save(filename)
}
