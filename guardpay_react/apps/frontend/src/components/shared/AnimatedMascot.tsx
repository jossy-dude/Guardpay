'use client'

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import type { MascotSpriteKey } from '@/lib/types'
import { FRAME_SETS, type MascotMood, type MascotFrameSet } from '@/features/mascot/engine'

/**
 * Animated per-theme mascots, driven by the mascot "AI" mood engine.
 *
 * Each mascot is a part-based SVG (head / eyes / mouth / hat / body / badge).
 * The mood engine picks a frame set — eyes, mouth, posture and fidget rhythm —
 * and a `talking` flag drives lip-sync-lite: the jaw (lower head + mouth)
 * pulses on a syllable timer. Idle micro-loops (breathing, blinking, random
 * fidgets, gaze tracking) keep the character feeling alive.
 */

interface CharacterDef {
  head: string
  body: string
  accent: string
  eye: string
  glow?: string
  antenna?: boolean
  hat?: 'flat' | 'brim' | 'crown' | 'beanie' | 'hardhat' | 'fedora' | 'leaf' | 'visor'
  idle: { breathe: number; sway: number; blinkEvery: number; fidget: number }
}

const T = (name: string) => `var(--${name})`

const CHARACTERS: Record<MascotSpriteKey, CharacterDef> = {
  guard: {
    head: T('muted-fg'), body: T('secondary'), accent: T('primary'), eye: T('bg'),
    hat: 'brim', idle: { breathe: 2.4, sway: 0.6, blinkEvery: 3.4, fidget: 5 },
  },
  pixel: {
    head: T('muted-fg'), body: T('secondary'), accent: T('accent'), eye: T('bg'),
    glow: T('accent'), antenna: true, hat: 'visor',
    idle: { breathe: 1.1, sway: 1.6, blinkEvery: 4.8, fidget: 3 },
  },
  detective: {
    head: T('muted-fg'), body: T('secondary'), accent: T('primary'), eye: T('bg'),
    hat: 'fedora', idle: { breathe: 3.2, sway: 3.2, blinkEvery: 4.2, fidget: 7 },
  },
  bot: {
    head: T('secondary'), body: T('secondary'), accent: T('accent'), eye: T('bg'),
    glow: T('success'), antenna: true, hat: 'visor',
    idle: { breathe: 0, sway: 0.4, blinkEvery: 0, fidget: 2 },
  },
  builder: {
    head: T('muted-fg'), body: T('secondary'), accent: T('accent'), eye: T('bg'),
    hat: 'hardhat', idle: { breathe: 2.2, sway: 0.8, blinkEvery: 3, fidget: 4.5 },
  },
  grove: {
    head: T('muted-fg'), body: T('secondary'), accent: T('success'), eye: T('bg'),
    hat: 'leaf', idle: { breathe: 3.4, sway: 2.4, blinkEvery: 4.6, fidget: 6 },
  },
  scribe: {
    head: T('muted-fg'), body: T('secondary'), accent: T('primary'), eye: T('bg'),
    hat: 'crown', idle: { breathe: 2.8, sway: 2.8, blinkEvery: 4.4, fidget: 8 },
  },
  scout: {
    head: T('muted-fg'), body: T('secondary'), accent: T('accent'), eye: T('bg'),
    hat: 'beanie', idle: { breathe: 2, sway: 1.2, blinkEvery: 3.8, fidget: 5.5 },
  },
}

export function AnimatedMascot({
  sprite,
  size = 96,
  className,
  onInteract,
  mood = 'idle',
  talking = false,
}: {
  sprite: MascotSpriteKey
  size?: number
  className?: string
  onInteract?: (idleOnly?: boolean) => void
  /** mood from the mascot AI engine — drives eyes/mouth/posture */
  mood?: MascotMood
  /** lip-sync-lite: pulses the jaw while true */
  talking?: boolean
}) {
  const def = CHARACTERS[sprite] ?? CHARACTERS.guard
  return (
    <CharacterMascot
      def={def}
      size={size}
      className={className}
      onInteract={onInteract}
      mood={mood}
      talking={talking}
    />
  )
}

function CharacterMascot({
  def,
  size,
  className,
  onInteract,
  mood,
  talking,
}: {
  def: CharacterDef
  size: number
  className?: string
  onInteract?: (idleOnly?: boolean) => void
  mood: MascotMood
  talking: boolean
}) {
  const controls = useAnimationControls()
  const containerRef = useRef<HTMLDivElement>(null)
  const [blink, setBlink] = useState(false)
  const [wave, setWave] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [gaze, setGaze] = useState({ x: 0, y: 0 })
  const [heart, setHeart] = useState(false)
  const [jaw, setJaw] = useState(0)

  const frames = useMemo(() => FRAME_SETS[mood] ?? FRAME_SETS.idle, [mood])
  const activeBlinkEvery = def.idle.blinkEvery || frames.fidget

  // blink + random fidget loop (personality tweaked by mood)
  useEffect(() => {
    if (!activeBlinkEvery) return
    const t = setInterval(() => setBlink((b) => !b), activeBlinkEvery * 1000)
    return () => clearInterval(t)
  }, [activeBlinkEvery])

  // lip-sync-lite: jaw pulses on a syllable timer while talking
  useEffect(() => {
    if (!talking) {
      setJaw(0)
      return
    }
    let alive = true
    let timer: number
    const pulse = () => {
      if (!alive) return
      setJaw(1)
      timer = window.setTimeout(() => {
        if (!alive) return
        setJaw(0)
        timer = window.setTimeout(pulse, 150 + Math.random() * 220)
      }, 120 + Math.random() * 90)
    }
    timer = window.setTimeout(pulse, 60)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [talking])

  // idle micro-loop: random fidgets scaled by mood's fidget rate
  useEffect(() => {
    if (!def.idle.fidget) return
    let alive = true
    const loop = () => {
      if (!alive) return
      const delay = frames.fidget * 1000 + Math.random() * 900
      setTimeout(() => {
        if (!alive) return
        void controls.start({
          x: [0, (Math.random() - 0.5) * 2.4, 0],
          rotate: [0, (Math.random() - 0.5) * 1.6, 0],
          transition: { duration: 0.6, ease: 'easeOut' },
        })
        loop()
      }, delay)
    }
    loop()
    return () => { alive = false }
  }, [frames.fidget, controls, def.idle.fidget])

  const handlePointerMove = (e: PointerEvent) => {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = ((e.clientX - r.left) / r.width - 0.5) * 2
    const dy = ((e.clientY - r.top) / r.height - 0.5) * 2
    setGaze({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-0.7, Math.min(0.7, dy)) })
  }

  const happySquint = () => {
    setBlink(true)
    setTimeout(() => setBlink(false), 140)
    setTimeout(() => setBlink(true), 360)
    setTimeout(() => setBlink(false), 500)
  }

  const handlePointerEnter = () => {
    setHovering(true)
    setWave(true)
    happySquint()
    setHeart(true)
    setTimeout(() => setHeart(false), 1500)
    void controls.start({
      scale: [1, 1.06, 1],
      rotate: [0, -2.5, 2, 0],
      transition: { duration: 0.5, ease: 'easeOut' },
    })
    onInteract?.(true)
    setTimeout(() => setWave(false), 1400)
  }
  const handlePointerLeave = () => {
    setHovering(false)
    setGaze({ x: 0, y: 0 })
    void controls.start({ scale: 1, rotate: 0, transition: { duration: 0.3 } })
  }

  return (
    <motion.div
      aria-hidden="true"
      ref={containerRef}
      className={className}
      style={{ width: size, height: size, cursor: 'grab' }}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      whileTap={{ scale: 0.95 }}
    >
      <motion.svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ overflow: 'visible' }}
        animate={controls}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        {/* breathing body group — posture shifts with mood */}
        <motion.g
          style={{ transformOrigin: '50% 92%' }}
          animate={frames.posture === 'bounce' ? { y: [0, -3, 0] } : frames.posture === 'slouch' ? { y: [0, 1.5, 0] } : def.idle.breathe ? { y: [0, -2, 0] } : undefined}
          transition={
            frames.posture === 'bounce'
              ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' }
              : frames.posture === 'slouch'
                ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }
                : def.idle.breathe
                  ? { duration: def.idle.breathe, repeat: Infinity, ease: 'easeInOut' }
                  : undefined
          }
        >
          <CharacterBody
            def={def}
            blink={blink}
            hovering={hovering}
            waving={wave}
            gaze={gaze}
            heart={heart}
            frames={frames}
            talking={talking}
            jaw={jaw}
          />
        </motion.g>
      </motion.svg>
    </motion.div>
  )
}

/** Small animated 4-point sparkle used for hover easter eggs. */
function Sparkle({ x, y, delay, color }: { x: number; y: number; delay: number; color: string }) {
  return (
    <motion.path
      d={`M${x} ${y - 4} Q${x} ${y} ${x + 4} ${y} Q${x} ${y} ${x} ${y + 4} Q${x} ${y} ${x - 4} ${y} Q${x} ${y} ${x} ${y - 4} Z`}
      fill={color}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
      transition={{ duration: 1.3, delay, repeat: Infinity, repeatDelay: 1.4, ease: 'easeInOut' }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    />
  )
}

/** Mood → eye geometry. */
function eyeShape(kind: MascotFrameSet['eyes']) {
  switch (kind) {
    case 'happy':
      return { r: 1.4, style: 'happy' as const }
    case 'sad':
      return { r: 2.4, style: 'sad' as const }
    case 'half':
      return { r: 1.8, style: 'half' as const }
    case 'closed':
      return { r: 0, style: 'closed' as const }
    default:
      return { r: 3, style: 'open' as const }
  }
}

/** The static base of a character — returns a positioned <g> with all parts. */
function CharacterBody({
  def,
  blink,
  hovering,
  waving,
  gaze,
  heart,
  frames,
  talking,
  jaw,
}: {
  def: CharacterDef
  blink: boolean
  hovering: boolean
  waving: boolean
  gaze: { x: number; y: number }
  heart: boolean
  frames: MascotFrameSet
  talking: boolean
  jaw: number
}) {
  const eyeY = blink ? 52.5 : 50
  const eyeOffset = 2.4
  const eyes = eyeShape(blink ? 'closed' : frames.eyes)
  const jawOpen = talking ? jaw * 4.5 : 0

  return (
    <g>
      {/* shadow */}
      <ellipse cx="50" cy="93" rx="20" ry="4" fill="var(--bg)" opacity="0.35" />

      {/* antenna glow */}
      {def.antenna && (
        <motion.g
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <line x1="50" y1="30" x2="50" y2="20" stroke={def.accent} strokeWidth="2" />
          <circle cx="50" cy="17" r="3" fill={def.glow ?? def.accent} />
        </motion.g>
      )}

      {/* heart bubble easter egg */}
      {heart && (
        <motion.g
          initial={{ opacity: 0, y: 4, scale: 0.6 }}
          animate={{ opacity: [0, 1, 1, 0], y: -16, scale: 1 }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
        >
          <path
            d="M50 30 C47 26 42 26 42 30 C42 33.5 47 36 50 39 C53 36 58 33.5 58 30 C58 26 53 26 50 30 Z"
            fill="var(--danger)"
          />
        </motion.g>
      )}

      {/* hover sparkles */}
      {hovering && (
        <>
          <Sparkle x={28} y={30} delay={0} color="var(--accent)" />
          <Sparkle x={72} y={34} delay={0.35} color="var(--accent)" />
          <Sparkle x={50} y={22} delay={0.7} color="var(--primary)" />
        </>
      )}

      {/* waving arm */}
      {waving && (
        <motion.g
          initial={{ rotate: 0 }}
          animate={{ rotate: [0, -35, 20, -30, 25, -30, 0] }}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
          style={{ transformOrigin: '34px 66px' }}
        >
          <rect x="30" y="56" width="8" height="20" rx="4" fill={def.body} />
          <circle cx="34" cy="55" r="5" fill={def.head} />
        </motion.g>
      )}

      {/* body / torso — slouch pulls it down, perk lifts it */}
      <motion.g animate={frames.posture === 'slouch' ? { y: 1.5 } : frames.posture === 'perk' ? { y: -1 } : undefined}>
        <rect x="30" y="60" width="40" height="30" rx="10" fill={def.body} />
      </motion.g>

      {/* hat */}
      <Hat def={def} />

      {/* head — lower half (jaw) moves for lip-sync */}
      <motion.circle
        cx="50"
        cy="47"
        r="17"
        fill={def.head}
        animate={
          hovering
            ? { scale: [1, 1.05, 1] }
            : frames.posture === 'bounce'
              ? { y: [0, -1, 0] }
              : undefined
        }
        transition={
          hovering
            ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' }
            : frames.posture === 'bounce'
              ? { duration: 0.5, repeat: Infinity, ease: 'easeInOut' }
              : undefined
        }
      />
      {/* lower face / jaw overlay that pulses while talking */}
      {talking && (
        <motion.path
          d="M35 50 Q50 62 65 50 Q50 58 35 50 Z"
          fill={def.head}
          animate={{ y: jawOpen }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          style={{ transformOrigin: '50px 50px' }}
        />
      )}

      {/* eyes — pupils follow the pointer when it's near; mood changes shape */}
      {eyes.style === 'happy' && (
        <>
          <path d="M41 51 Q43 48.5 45 51" stroke={def.eye} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M55 51 Q57 48.5 59 51" stroke={def.eye} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </>
      )}
      {eyes.style === 'sad' && (
        <>
          <circle cx="43" cy={eyeY} r="2.6" fill={def.eye} />
          <circle cx="57" cy={eyeY} r="2.6" fill={def.eye} />
        </>
      )}
      {eyes.style === 'half' && (
        <>
          <rect x="40.5" y={eyeY - 1.6} width="5" height="1.8" rx="0.9" fill={def.eye} />
          <rect x="54.5" y={eyeY - 1.6} width="5" height="1.8" rx="0.9" fill={def.eye} />
        </>
      )}
      {eyes.style === 'closed' && (
        <>
          <path d="M40.5 51.5 Q43 49.5 45.5 51.5" stroke={def.eye} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M54.5 51.5 Q57 49.5 59.5 51.5" stroke={def.eye} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      )}
      {eyes.style === 'open' && (
        <>
          <motion.circle
            animate={{ cx: 43 + gaze.x * eyeOffset, cy: eyeY + gaze.y * eyeOffset }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            cx={43}
            cy={eyeY}
            r={eyes.r}
            fill={def.eye}
          />
          <motion.circle
            animate={{ cx: 57 + gaze.x * eyeOffset, cy: eyeY + gaze.y * eyeOffset }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            cx={57}
            cy={eyeY}
            r={eyes.r}
            fill={def.eye}
          />
        </>
      )}

      {/* mouth — mood + talking shape it */}
      {frames.mouth === 'smile' && (
        <path d="M44 56 Q50 61 56 56" stroke={def.eye} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      )}
      {frames.mouth === 'open' && (
        <motion.ellipse
          cx="50"
          cy="57"
          rx="3.4"
          ry={2 + jawOpen}
          fill={def.eye}
          animate={{ ry: 2 + jawOpen }}
          transition={{ duration: 0.12 }}
        />
      )}
      {frames.mouth === 'grimace' && (
        <path d="M45 58 Q50 55 55 58" stroke={def.eye} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      )}
      {frames.mouth === 'neutral' && (
        <path d="M46 57 L54 57" stroke={def.eye} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      )}
      {frames.mouth === 'yawn' && (
        <motion.ellipse
          cx="50"
          cy="57"
          rx="3"
          ry={1.5 + jawOpen}
          fill={def.eye}
          animate={{ ry: 1.5 + jawOpen }}
          transition={{ duration: 0.3 }}
        />
      )}

      {/* badge on torso */}
      <motion.circle
        cx="50"
        cy="72"
        r="4"
        fill={def.accent}
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <circle cx="50" cy="72" r="1.6" fill="var(--bg)" />
    </g>
  )
}

function Hat({ def }: { def: CharacterDef }) {
  const { hat, accent, head } = def
  switch (hat) {
    case 'brim':
      return (
        <g>
          <rect x="32" y="30" width="36" height="6" rx="3" fill={accent} />
          <rect x="40" y="24" width="20" height="9" rx="3" fill={accent} />
        </g>
      )
    case 'visor':
      return (
        <g>
          <rect x="35" y="31" width="30" height="7" rx="3.5" fill={accent} opacity="0.85" />
          <rect x="38" y="29" width="24" height="4" rx="2" fill={head} />
        </g>
      )
    case 'fedora':
      return (
        <g>
          <path d="M32 34 Q50 24 68 34 L64 37 Q50 29 36 37 Z" fill={accent} />
          <rect x="31" y="33" width="38" height="4" rx="2" fill={accent} />
          <rect x="46" y="28" width="4" height="7" fill={head} />
        </g>
      )
    case 'crown':
      return (
        <g>
          <path d="M34 36 L37 26 L43 32 L50 23 L57 32 L63 26 L66 36 Z" fill={accent} />
          <rect x="34" y="35" width="32" height="5" rx="2" fill={accent} />
          <circle cx="43" cy="31" r="1.4" fill="var(--bg)" />
          <circle cx="50" cy="29" r="1.4" fill="var(--bg)" />
          <circle cx="57" cy="31" r="1.4" fill="var(--bg)" />
        </g>
      )
    case 'beanie':
      return (
        <g>
          <path d="M34 33 Q35 23 50 23 Q65 23 66 33 Q58 30 50 31 Q42 30 34 33 Z" fill={accent} />
          <rect x="42" y="24" width="16" height="4" rx="2" fill={head} />
        </g>
      )
    case 'hardhat':
      return (
        <g>
          <path d="M34 33 Q34 24 50 24 Q66 24 66 33 Q58 29 50 29 Q42 29 34 33 Z" fill={accent} />
          <rect x="32" y="32" width="36" height="4" rx="2" fill={accent} />
        </g>
      )
    case 'leaf':
      return (
        <g>
          <path d="M50 24 Q42 16 30 22 Q38 14 50 20 Q62 14 70 22 Q58 16 50 24 Z" fill={accent} />
          <rect x="46" y="25" width="8" height="5" rx="2" fill={head} />
        </g>
      )
    default:
      return null
  }
}
