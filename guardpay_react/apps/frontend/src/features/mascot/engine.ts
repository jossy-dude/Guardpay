'use client'

/**
 * Mascot "AI" — a deterministic, dependency-free behavioural engine.
 *
 * Model:  valence (mood -1..1) × energy (0..1), both driven by app events and
 * decay. Short-term memory keeps the last few events so reactions compound
 * (two settlements in a row feel better than one). A boredom clock makes the
 * mascot seek attention after long idle stretches, so it feels alive rather
 * than frozen.
 *
 * Pure logic — React wiring lives in AnimatedMascot / Mascot.
 */

export type MascotMood = 'happy' | 'excited' | 'sad' | 'tired' | 'focused' | 'idle'

export type MascotEvent = 'paid' | 'unpaid' | 'streak' | 'idle' | 'busy' | 'leader'

export const EVENT_FX: Record<MascotEvent, { valence: number; energy: number }> = {
  paid: { valence: 0.35, energy: 0.25 },
  streak: { valence: 0.6, energy: 0.5 },
  idle: { valence: -0.05, energy: -0.08 },
  unpaid: { valence: -0.18, energy: -0.05 },
  busy: { valence: 0.05, energy: -0.15 },
  leader: { valence: 0.2, energy: 0.3 },
}

/** Frame-set names the renderer maps to animations. */
export interface MascotFrameSet {
  eyes: 'open' | 'happy' | 'sad' | 'half' | 'closed'
  mouth: 'smile' | 'open' | 'grimace' | 'neutral' | 'yawn'
  posture: 'up' | 'slouch' | 'perk' | 'bounce'
  fidget: number // seconds between random fidgets
}

export const FRAME_SETS: Record<MascotMood, MascotFrameSet> = {
  excited: { eyes: 'happy', mouth: 'open', posture: 'bounce', fidget: 1.4 },
  happy: { eyes: 'happy', mouth: 'smile', posture: 'perk', fidget: 2.2 },
  focused: { eyes: 'half', mouth: 'neutral', posture: 'up', fidget: 4.5 },
  idle: { eyes: 'open', mouth: 'neutral', posture: 'up', fidget: 3.2 },
  tired: { eyes: 'closed', mouth: 'yawn', posture: 'slouch', fidget: 6 },
  sad: { eyes: 'sad', mouth: 'grimace', posture: 'slouch', fidget: 5 },
}

export interface MascotState {
  valence: number
  energy: number
  mood: MascotMood
  memory: MascotEvent[]
  boredom: number // 0..1, rises while idle
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export const MEMORY_SIZE = 6
export const BOREDOM_MAX = 1

/** Apply an event, updating valence/energy, memory and the boredom clock. */
export function applyEvent(s: MascotState, ev: MascotEvent): MascotState {
  const fx = EVENT_FX[ev]
  const valence = clamp(s.valence + fx.valence, -1, 1)
  const energy = clamp(s.energy + fx.energy, 0, 1)
  const memory = [...s.memory, ev].slice(-MEMORY_SIZE)
  // idle resets the attention clock; anything else buys a moment of patience
  const boredom = ev === 'idle' ? clamp(s.boredom + 0.25, 0, BOREDOM_MAX) : clamp(s.boredom - 0.5, 0, BOREDOM_MAX)
  return { valence, energy, memory, boredom, mood: resolveMood(valence, energy, memory, boredom) }
}

/** Slow decay pulls valence/energy back toward the resting baseline. */
export function decay(s: MascotState, dt: number): MascotState {
  const valence = clamp(s.valence * Math.pow(0.992, dt), -1, 1)
  const energy = clamp(s.energy * Math.pow(0.994, dt), 0, 1)
  const boredom = clamp(s.boredom + dt * 0.0035, 0, BOREDOM_MAX)
  return { ...s, valence, energy, boredom, mood: resolveMood(valence, energy, s.memory, boredom) }
}

/** Continuous time drives the resting mood even without events. */
export function tickMood(state: MascotState, dt: number): MascotState {
  return decay(state, dt)
}

export function resolveMood(
  valence: number,
  energy: number,
  memory: MascotEvent[],
  boredom: number,
): MascotMood {
  // boredom overrides everything — the mascot wants attention
  if (boredom >= 0.75) return 'tired'
  // consecutive settlements compound into an excited streak
  const recent = memory.slice(-3)
  const streakPaid = recent.length >= 2 && recent[recent.length - 1] === 'paid' && recent[recent.length - 2] === 'paid'
  if (streakPaid && valence >= 0.35) return 'excited'
  if (valence >= 0.55 && energy >= 0.4) return 'excited'
  if (valence >= 0.15) return 'happy'
  if (valence <= -0.35) return 'sad'
  if (energy <= 0.2) return 'focused'
  return 'idle'
}

export function initialState(): MascotState {
  return { valence: 0.1, energy: 0.6, mood: 'idle', memory: [], boredom: 0 }
}

/** Map a mood to a small speech-ish nudge shown by the host component. */
export function moodNudge(mood: MascotMood): string | null {
  switch (mood) {
    case 'excited':
      return 'Fantastic!'
    case 'happy':
      return 'Nice work.'
    case 'sad':
      return 'A house slipped…'
    case 'tired':
      return 'Been a while…'
    case 'focused':
      return 'On it.'
    default:
      return null
  }
}
