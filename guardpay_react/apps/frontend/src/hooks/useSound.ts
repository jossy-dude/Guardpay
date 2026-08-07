'use client'

import { useCallback } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { resolveTheme, THEMES } from '@/features/theming/themes'
import type { SoundPreset, ThemeId } from '@/lib/types'

/**
 * Hybrid sound engine.
 *
 * Primary: curated CC0 sound files bundled in `/sounds/*.ogg` (Kenney.nl —
 * UI Audio, Interface Sounds, Casino Audio). Played through a shared master
 * gain bus so volume + mute apply everywhere.
 *
 * Fallback: a tiny Web Audio synth (zero-asset) used when a buffer isn't
 * loaded yet or decoding fails, so sound still works offline/instant.
 *
 * Per-theme flavor: each theme gets a stable, small pitch/gain shift derived
 * from its id, and each play adds slight randomization to avoid habituation.
 * Sound is always driven by the *active* theme.
 */

interface Tone {
  freq: number
  end?: number
  dur: number
  type: OscillatorType
  gain: number
}

// Synth fallback per preset (used only when the real file is unavailable).
const PRESETS: Record<SoundPreset, Tone[]> = {
  tick: [{ freq: 700, end: 560, dur: 0.05, type: 'square', gain: 0.05 }],
  click: [
    { freq: 180, dur: 0.03, type: 'square', gain: 0.08 },
    { freq: 240, dur: 0.03, type: 'square', gain: 0.05 },
  ],
  type: [
    { freq: 130, end: 90, dur: 0.04, type: 'square', gain: 0.09 },
    { freq: 95, end: 70, dur: 0.04, type: 'square', gain: 0.06 },
  ],
  chime: [
    { freq: 660, dur: 0.06, type: 'square', gain: 0.07 },
    { freq: 990, dur: 0.09, type: 'square', gain: 0.06 },
    { freq: 1320, dur: 0.14, type: 'square', gain: 0.05 },
  ],
  ding: [
    { freq: 880, end: 880, dur: 0.28, type: 'sine', gain: 0.12 },
    { freq: 1760, end: 1550, dur: 0.22, type: 'sine', gain: 0.03 },
  ],
  coin: [
    { freq: 1000, dur: 0.05, type: 'square', gain: 0.06 },
    { freq: 500, dur: 0.06, type: 'square', gain: 0.06 },
    { freq: 1300, dur: 0.12, type: 'square', gain: 0.06 },
  ],
  beep: [{ freq: 440, dur: 0.09, type: 'square', gain: 0.06 }],
  thock: [{ freq: 160, end: 110, dur: 0.12, type: 'triangle', gain: 0.1 }],
  whoosh: [{ freq: 280, end: 1100, dur: 0.12, type: 'sine', gain: 0.04 }],
  paid: [
    { freq: 523, dur: 0.07, type: 'sine', gain: 0.11 },
    { freq: 784, dur: 0.09, type: 'sine', gain: 0.11 },
    { freq: 1046, dur: 0.14, type: 'sine', gain: 0.09 },
  ],
  unpay: [
    { freq: 700, end: 620, dur: 0.1, type: 'sine', gain: 0.06 },
    { freq: 560, end: 500, dur: 0.24, type: 'sine', gain: 0.05 },
  ],
  error: [{ freq: 220, end: 150, dur: 0.2, type: 'sawtooth', gain: 0.08 }],
  close: [{ freq: 400, end: 300, dur: 0.12, type: 'sine', gain: 0.08 }],
}

/** Bundled CC0 sound bank — each preset maps to one or more real files. */
const FILE_BANK: Record<SoundPreset, { files: string[]; gain?: number }> = {
  tick: { files: ['/sounds/tick-1.ogg'] },
  click: { files: ['/sounds/click-1.ogg', '/sounds/click-2.ogg'] },
  type: { files: ['/sounds/select-1.ogg'] },
  chime: { files: ['/sounds/paid-1.ogg', '/sounds/paid-2.ogg'] },
  ding: { files: ['/sounds/ding-1.ogg'] },
  coin: { files: ['/sounds/coin-1.ogg'] },
  beep: { files: ['/sounds/toggle-2.ogg'] },
  thock: { files: ['/sounds/stack-1.ogg'], gain: 0.8 },
  whoosh: { files: ['/sounds/hover-1.ogg'] },
  paid: { files: ['/sounds/paid-1.ogg', '/sounds/paid-2.ogg'] },
  unpay: { files: ['/sounds/ding-1.ogg'], gain: 0.5 },
  error: { files: ['/sounds/error-1.ogg'] },
  close: { files: ['/sounds/toggle-1.ogg'] },
}

/** Sound assets + license credits (shown in Settings → Sounds & Credits). */
export const SOUND_CREDITS: { pack: string; author: string; license: string; url: string }[] = [
  {
    pack: 'UI Audio',
    author: 'Kenney Vleugels (Kenney.nl)',
    license: 'CC0 1.0 Public Domain',
    url: 'https://kenney.nl/assets/ui-audio',
  },
  {
    pack: 'Interface Sounds',
    author: 'Kenney Vleugels (Kenney.nl)',
    license: 'CC0 1.0 Public Domain',
    url: 'https://kenney.nl/assets/interface-sounds',
  },
  {
    pack: 'Casino Audio',
    author: 'Kenney Vleugels (Kenney.nl)',
    license: 'CC0 1.0 Public Domain',
    url: 'https://kenney.nl/assets/casino-audio',
  },
]

interface SoundState {
  muted: boolean
  volume: number // 0..1 master
  setMuted: (v: boolean) => void
  setVolume: (v: number) => void
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      muted: false,
      volume: 0.9,
      setMuted: (v) => set({ muted: v }),
      setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
    }),
    {
      name: 'guardpay-sound',
      version: 2,
      migrate: (persisted) => {
        const p = persisted as Partial<SoundState>
        return { muted: p.muted ?? false, volume: p.volume ?? 0.9 }
      },
    },
  ),
)

let sharedCtx: AudioContext | null = null
let masterGain: GainNode | null = null
const bufferCache = new Map<string, AudioBuffer>()

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!sharedCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    sharedCtx = new Ctx()
    masterGain = sharedCtx.createGain()
    masterGain.gain.value = useSoundStore.getState().volume
    masterGain.connect(sharedCtx.destination)
  }
  if (sharedCtx.state === 'suspended') void sharedCtx.resume()
  if (masterGain) masterGain.gain.value = useSoundStore.getState().volume
  return sharedCtx
}

/** Warm the audio pipeline + prefetch buffers on the first user gesture. */
function warm() {
  const ctx = getCtx()
  if (!ctx) return
  for (const preset of Object.values(FILE_BANK)) {
    for (const file of preset.files) void loadBuffer(ctx, file)
  }
  window.removeEventListener('pointerdown', warm)
}
if (typeof window !== 'undefined') window.addEventListener('pointerdown', warm)

async function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  const hit = bufferCache.get(url)
  if (hit) return hit
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.arrayBuffer()
    const buf = await ctx.decodeAudioData(data)
    bufferCache.set(url, buf)
    return buf
  } catch {
    return null
  }
}

/** Stable per-theme flavor (pitch + gain), so each theme feels distinct. */
function flavorFor(themeId: string): { rate: number; gain: number } {
  let h = 0
  for (const c of themeId) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return { rate: 0.92 + (h % 5) * 0.05, gain: 0.9 + (h % 3) * 0.08 }
}

function playPreset(ctx: AudioContext, preset: SoundPreset, flavor: { rate: number; gain: number }) {
  const entry = FILE_BANK[preset]
  if (entry?.files.length) {
    const file = entry.files[Math.floor(Math.random() * entry.files.length)]
    const buf = file ? bufferCache.get(file) : null
    if (buf) {
      const src = ctx.createBufferSource()
      src.buffer = buf
      const g = ctx.createGain()
      const jitter = 0.97 + Math.random() * 0.06
      src.playbackRate.value = flavor.rate * jitter
      const now = ctx.currentTime
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime((entry.gain ?? 1) * flavor.gain, now + 0.008)
      g.gain.setValueAtTime((entry.gain ?? 1) * flavor.gain, now + 0.05)
      g.gain.exponentialRampToValueAtTime(0.0001, now + (buf.duration || 0.4))
      src.connect(g).connect(masterGain ?? ctx.destination)
      src.start(now)
      src.stop(now + (buf.duration || 0.4) + 0.02)
      return
    }
  }
  // synth fallback — plays immediately when the real buffer isn't ready
  const tones = PRESETS[preset]
  if (!tones) return
  const now = ctx.currentTime
  for (const t of tones) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = t.type
    osc.frequency.setValueAtTime(t.freq * flavor.rate, now)
    if (t.end) osc.frequency.exponentialRampToValueAtTime(t.end * flavor.rate, now + t.dur)
    g.gain.setValueAtTime(t.gain * flavor.gain, now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + t.dur)
    osc.connect(g).connect(masterGain ?? ctx.destination)
    osc.start(now)
    osc.stop(now + t.dur + 0.02)
  }
}

/**
 * Maps a semantic action to the active theme's preset. Callers pass a semantic
 * name ('toggle' | 'paid' | 'error' | 'hover'); the theme decides the sound.
 */
export function useSound() {
  const play = useCallback((name: SoundPreset | 'toggle' | 'paid' | 'unpay' | 'error' | 'hover') => {
    if (useSoundStore.getState().muted) return
    playInternal(name)
  }, [])

  /** Preview always plays (bypasses mute) so users can audition sounds. */
  const preview = useCallback((name: SoundPreset | 'toggle' | 'paid' | 'unpay' | 'error' | 'hover') => {
    playInternal(name)
  }, [])

  /** Theme-specific preview — plays a semantic sound using a target theme's mapping, bypassing mute. */
  const previewTheme = useCallback((name: SoundPreset | 'toggle' | 'paid' | 'unpay' | 'error' | 'hover', themeId: ThemeId) => {
    playInternal(name, themeId)
  }, [])

  return { play, preview, previewTheme }
}

function playInternal(name: SoundPreset | 'toggle' | 'paid' | 'unpay' | 'error' | 'hover', themeId?: string) {
  try {
    const ctx = getCtx()
    if (!ctx) return
    const theme = themeId ? THEMES[themeId as ThemeId] : resolveTheme()
    if (!theme) return
    const semantic = name as 'toggle' | 'paid' | 'unpay' | 'error' | 'hover'
    const resolved = semantic in theme.sound ? theme.sound[semantic] : (name as SoundPreset)
    playPreset(ctx, resolved, flavorFor(theme.id))
  } catch {
    /* audio unavailable */
  }
}
