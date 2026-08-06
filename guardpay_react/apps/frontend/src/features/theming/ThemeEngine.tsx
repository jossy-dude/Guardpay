'use client'

import { useEffect } from 'react'
import { resolveTheme, useThemeStore } from './themes'

function shade(hex: string, factor: number): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const num = parseInt(h, 16)
  let r = (num >> 16) & 0xff
  let g = (num >> 8) & 0xff
  let b = num & 0xff
  if (factor > 0) {
    r = Math.round(r + (255 - r) * factor)
    g = Math.round(g + (255 - g) * factor)
    b = Math.round(b + (255 - b) * factor)
  } else {
    r = Math.round(r * (1 + factor))
    g = Math.round(g * (1 + factor))
    b = Math.round(b * (1 + factor))
  }
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`
}

export function ThemeEngine() {
  const { themeId, fontOverride, densityOverride, radiusOverride, accentOverride, textureOverride, shapeOverride } =
    useThemeStore()

  useEffect(() => {
    const theme = resolveTheme()
    const root = document.documentElement
    const c = theme.colors

    root.classList.toggle('dark', theme.dark)
    root.classList.toggle('theme-dark', theme.dark)
    root.classList.toggle('theme-light', !theme.dark)
    root.setAttribute('data-family', theme.family)

    root.style.setProperty('--bg', c.background)
    root.style.setProperty('--bg-rgb', hexToRgb(c.background))
    root.style.setProperty('--fg', c.foreground)
    root.style.setProperty('--card', c.card)
    root.style.setProperty('--card-hover', shade(c.card, theme.dark ? 0.08 : -0.02))
    root.style.setProperty('--border', c.border)
    root.style.setProperty('--border-strong', shade(c.border, theme.dark ? 0.2 : -0.15))
    root.style.setProperty('--primary', c.primary)
    root.style.setProperty('--primary-fg', c.primaryFg)
    root.style.setProperty('--primary-hover', shade(c.primary, theme.dark ? 0.12 : -0.1))
    root.style.setProperty('--secondary', c.secondary)
    root.style.setProperty('--accent', accentOverride ?? c.accent)
    root.style.setProperty('--danger', c.danger)
    root.style.setProperty('--success', c.success)
    root.style.setProperty('--muted', c.muted)
    root.style.setProperty('--muted-fg', c.mutedFg)

    root.style.setProperty('--radius', `${radiusOverride ?? theme.radius}px`)

    root.style.setProperty('--font-display', `'${fontOverride ? FONT_NAME(theme) : theme.font.display}', serif`)
    root.style.setProperty('--font-body', `'${theme.font.body}', sans-serif`)
    root.style.setProperty('--font-mono', `'${theme.font.mono}', monospace`)

    root.setAttribute('data-density', densityOverride ?? theme.density)
    root.setAttribute('data-texture', textureOverride ?? theme.texture ?? 'none')
    root.setAttribute('data-shape', theme.shape)

    // heatmap ramp
    c.heat.forEach((step, idx) => {
      root.style.setProperty(`--heat-${idx + 1}`, step)
    })
  }, [themeId, fontOverride, densityOverride, radiusOverride, accentOverride, textureOverride, shapeOverride])

  return null
}

function FONT_NAME(theme: ReturnType<typeof resolveTheme>) {
  // resolve the actual font object for override naming
  return theme.font.display
}