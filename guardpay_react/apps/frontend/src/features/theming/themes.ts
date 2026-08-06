import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MascotSpriteKey, MascotTheme, SoundTheme, ThemeFamily, ThemeId } from '@/lib/types'

// ---- Font pool ----
export interface FontPair {
  display: string
  body: string
  mono: string
  label: string
}

export const FONTS: {
  editorial: FontPair
  blueprint: FontPair
  arcade: FontPair
  terminal: FontPair
  organic: FontPair
  newsprint: FontPair
  broadsheet: FontPair
  blackletter: FontPair
} = {
  editorial: {
    label: 'Editorial',
    display: 'Playfair Display',
    body: 'Inter',
    mono: 'JetBrains Mono',
  },
  blueprint: {
    label: 'Blueprint',
    display: 'Space Grotesk',
    body: 'Inter',
    mono: 'JetBrains Mono',
  },
  arcade: {
    label: 'Arcade',
    display: 'Press Start 2P',
    body: 'Space Grotesk',
    mono: 'VT323',
  },
  terminal: {
    label: 'Terminal',
    display: 'JetBrains Mono',
    body: 'Space Grotesk',
    mono: 'JetBrains Mono',
  },
  organic: {
    label: 'Organic',
    display: 'Fraunces',
    body: 'Inter',
    mono: 'JetBrains Mono',
  },
  newsprint: {
    label: 'Newsprint',
    display: 'Playfair Display',
    body: 'Fraunces',
    mono: 'JetBrains Mono',
  },
  broadsheet: {
    label: 'Broadsheet',
    display: 'Playfair Display SC',
    body: 'Lora',
    mono: 'IBM Plex Mono',
  },
  blackletter: {
    label: 'Blackletter',
    display: 'UnifrakturMaguntia',
    body: 'Lora',
    mono: 'IBM Plex Mono',
  },
}

// ---- Theme definitions ----
/** A resident avatar configuration (seeded pixel art + optional ring). */
export interface AvatarTheme {
  seedBase: string
  style: 'pixel-art' | 'pixel-art-nolook'
  background: string[]
  ring: 'brass' | 'accent' | 'primary' | 'success' | 'none'
}

export interface ThemeDefinition {
  id: ThemeId
  label: string
  description: string
  dark: boolean
  family: ThemeFamily
  /** Color ramp — override zone instead of wholesale. Each is a full shade scale. */
  colors: {
    background: string
    foreground: string
    card: string
    border: string
    primary: string
    primaryFg: string
    secondary: string
    accent: string
    danger: string
    success: string
    muted: string
    mutedFg: string
    heat: string[] // 5-step heatmap ramp
  }
  font: FontPair
  density: 'compact' | 'comfortable' | 'spacious'
  radius: number // px
  texture?: 'paper' | 'grid' | 'carbon' | 'arcade' | 'dotted' | 'scan'
  meta: {
    author: string
    since: string
    tagline: string
  }
  sound: SoundTheme
  mascot: MascotTheme
  avatar: AvatarTheme
  /** pixel-matrix art key rendered by the mascot host for this theme */
  sprite: MascotSpriteKey
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
sepia: {
    id: 'sepia',
    label: 'Sepia Ledger',
    description: 'The classic GuardPay look, refined — warm paper bookkeeping with brass accents.',
    dark: false,
    family: 'watch',
    colors: {
      background: '#f5efd8',
      foreground: '#3d3424',
      card: '#fbf6e4',
      border: '#d9c9a3',
      primary: '#8a5a2b',
      primaryFg: '#fbf6e4',
      secondary: '#efe3c4',
      accent: '#a23b2e',
      danger: '#a23b2e',
      success: '#4d6b3a',
      muted: '#8a7c5e',
      mutedFg: '#6b5f46',
      heat: ['#e7d9b0', '#d9b65c', '#c78f28', '#a9701a', '#7c4d0e'],
    },
    font: FONTS.editorial,
    density: 'comfortable',
    radius: 8,
    texture: 'paper',
    meta: { author: 'GuardPay', since: '2024', tagline: 'The ledger, as it always was.' },
    sound: { toggle: 'type', paid: 'ding', error: 'error', hover: 'tick' },
    mascot: { key: 'guard', name: 'Teshale the Guard', role: 'Watchman · Gate 1', lines: ['ALL QUIET ON THE LEDGER', '6 DUES UNPAID', 'STREAK: 4 MONTHS'] },
    avatar: { seedBase: 'h', style: 'pixel-art', background: ['fbf6e4', 'efe3c4', '8a5a2b'], ring: 'brass' },
    sprite: 'guard',
  },
  'midnight-arcade': {
    id: 'midnight-arcade',
    label: 'Midnight Arcade',
    description: 'Neon-on-black pixel arcade. Press Start to settle the books.',
    dark: true,
    family: 'watch',
    colors: {
      background: '#0c0a1d',
      foreground: '#eae6ff',
      card: '#161233',
      border: '#2c2657',
      primary: '#ff4f9a',
      primaryFg: '#1c0713',
      secondary: '#1e1842',
      accent: '#41d9ff',
      danger: '#ff5c5c',
      success: '#3fe08f',
      muted: '#7d77ad',
      mutedFg: '#a49ed4',
      heat: ['#1a1537', '#251c52', '#43297c', '#7b36ad', '#c443c9'],
    },
    font: FONTS.arcade,
    density: 'compact',
    radius: 6,
    texture: 'arcade',
    meta: { author: 'Arcade', since: '2026', tagline: 'Coin inserted. Debt cleared.' },
    sound: { toggle: 'coin', paid: 'chime', error: 'error', hover: 'tick' },
    mascot: { key: 'pixel', name: '8-BIT KEEPER', role: 'Player 1', lines: ['LEVEL 1: ALL PAID', 'HI-SCORE 98 PTS', 'INSERT COIN 2 SETTLE'] },
    avatar: { seedBase: 'h8', style: 'pixel-art', background: ['161233', '43297c', 'ff4f9a'], ring: 'accent' },
    sprite: 'pixel',
  },
  blueprint: {
    id: 'blueprint',
    label: 'Blueprint',
    description: 'Architectural drafting board — technical cyan grid, sharp right angles.',
    dark: false,
    family: 'modern',
    colors: {
      background: '#eef3f7',
      foreground: '#163042',
      card: '#f7fafc',
      border: '#c2d0dc',
      primary: '#1565a8',
      primaryFg: '#f7fafc',
      secondary: '#dde8f0',
      accent: '#0e7c6b',
      danger: '#c0392b',
      success: '#1e8449',
      muted: '#7a93a8',
      mutedFg: '#5b7489',
      heat: ['#d6e3ee', '#7fb2d5', '#4a8fc2', '#2a6ba3', '#174f7d'],
    },
    font: FONTS.blueprint,
    density: 'compact',
    radius: 2,
    texture: 'grid',
    meta: { author: 'Studio', since: '2026', tagline: 'Every weld and wire accounted for.' },
    sound: { toggle: 'click', paid: 'ding', error: 'error', hover: 'tick' },
    mascot: { key: 'builder', name: 'Dr. Draft', role: 'Surveyor 2D', lines: ['DWG-0042: FULLY PAID', 'ELEVATION ARR 98%', 'CHECK THE SIGHTLINES'] },
    avatar: { seedBase: 'b', style: 'pixel-art', background: ['dde8f0', '1565a8', '0e7c6b'], ring: 'primary' },
    sprite: 'builder',
  },
  botanical: {
    id: 'botanical',
    label: 'Botanical',
    description: 'Forest reimagined — warm, leafy, alive. Everything under the canopy, paid.',
    dark: false,
    family: 'modern',
    colors: {
      background: '#eef2e4',
      foreground: '#2b3224',
      card: '#f5f7ec',
      border: '#c6d4a8',
      primary: '#527a35',
      primaryFg: '#f5f7ec',
      secondary: '#dbe5c6',
      accent: '#3e7d6c',
      danger: '#a4502e',
      success: '#3f7c4f',
      muted: '#8a9374',
      mutedFg: '#687450',
      heat: ['#dfe7c8', '#b0c98a', '#7fae5c', '#4f8f3c', '#2f6b28'],
    },
    font: FONTS.organic,
    density: 'comfortable',
    radius: 16,
    texture: 'dotted',
    meta: { author: 'Grove', since: '2026', tagline: 'Roots run deep, so does the ledger.' },
    sound: { toggle: 'tick', paid: 'ding', error: 'error', hover: 'whoosh' },
    mascot: { key: 'grove', name: 'Olive the Sprout', role: 'Canopy Warden', lines: ['LEAVES FALL, DUES DON\u2019T', 'GROWING 92% PAID', 'FRESH SOIL, CLEAR BOOKS'] },
    avatar: { seedBase: 'g', style: 'pixel-art', background: ['dbe5c6', '527a35', '3e7d6c'], ring: 'success' },
    sprite: 'grove',
  },
  sunwashed: {
    id: 'sunwashed',
    label: 'Sunwashed',
    description: 'Light, warm, paper-like. Laundry-dry air and breathing room for the books.',
    dark: false,
    family: 'modern',
    colors: {
      background: '#faf6ee',
      foreground: '#413a2f',
      card: '#ffffff',
      border: '#e3d7c0',
      primary: '#c07a3e',
      primaryFg: '#fff9ec',
      secondary: '#f0e6d2',
      accent: '#b0567a',
      danger: '#c0502e',
      success: '#6f8f52',
      muted: '#9a8c77',
      mutedFg: '#796b57',
      heat: ['#f3e8d0', '#e9c98f', '#e0ac5a', '#d58f33', '#b26e1e'],
    },
    font: FONTS.editorial,
    density: 'spacious',
    radius: 20,
    texture: 'paper',
    meta: { author: 'Sol', since: '2026', tagline: 'Warm, airy, and nothing overdue.' },
    sound: { toggle: 'tick', paid: 'ding', error: 'error', hover: 'whoosh' },
    mascot: { key: 'guard', name: 'Captain Clear Skies', role: 'Beach Patrol', lines: ['ALL CLEAR AHOY', 'SUNNY SIDE = PAID SIDE', 'TIDES IN, DUES OUT'] },
    avatar: { seedBase: 's', style: 'pixel-art', background: ['f0e6d2', 'c07a3e', 'b0567a'], ring: 'accent' },
    sprite: 'guard',
  },
  terminal: {
    id: 'terminal',
    label: 'Terminal',
    description: 'Green-on-black hacker terminal. Mono, terse, precise — log: all debts settled.',
    dark: true,
    family: 'watch',
    colors: {
      background: '#0c100b',
      foreground: '#d7ffe0',
      card: '#10150e',
      border: '#23401f',
      primary: '#3ddc68',
      primaryFg: '#0c100b',
      secondary: '#16220f',
      accent: '#22c9e0',
      danger: '#ff5f56',
      success: '#3ddc68',
      muted: '#5f7a62',
      mutedFg: '#93b596',
      heat: ['#12311a', '#1c4a24', '#2a6b35', '#3b9146', '#55c05f'],
    },
    font: FONTS.terminal,
    density: 'compact',
    radius: 2,
    texture: 'scan',
    meta: { author: '$root', since: '2026', tagline: 'log: all dues settled.' },
    sound: { toggle: 'beep', paid: 'coin', error: 'error', hover: 'tick' },
    mascot: { key: 'bot', name: 'CLI-9', role: 'root@ledger', lines: ['> tail dues.log ... 0', '> grep PAID --count 84%', '> exit(0)  ALL CLEAR'] },
    avatar: { seedBase: 't', style: 'pixel-art', background: ['16220f', '3ddc68', '22c9e0'], ring: 'none' },
    sprite: 'bot',
  },
  'royal-ledger': {
    id: 'royal-ledger',
    label: 'Royal Ledger',
    description: 'Deep jewel tones, editorial gravitas — the community\u2019s coffers, its crown.',
    dark: true,
    family: 'modern',
    colors: {
      background: '#15121e',
      foreground: '#efe9f7',
      card: '#1d1830',
      border: '#3a314f',
      primary: '#b4903c',
      primaryFg: '#15121e',
      secondary: '#2a2342',
      accent: '#7c5cbf',
      danger: '#d85f6a',
      success: '#6faf62',
      muted: '#7d7396',
      mutedFg: '#a99fbf',
      heat: ['#241e38', '#423457', '#6b4f8a', '#a272b5', '#d0a0d8'],
    },
    font: FONTS.organic,
    density: 'comfortable',
    radius: 12,
    texture: 'dotted',
    meta: { author: 'Scribe', since: '2026', tagline: 'By decree: accounts balanced by nightfall.' },
    sound: { toggle: 'click', paid: 'ding', error: 'error', hover: 'whoosh' },
    mascot: { key: 'scribe', name: 'Scribe Astor', role: 'Keeper of the Crown', lines: ['THE LEDGER IS LEGEND', 'COFFERS FULL THIS EVE', 'HONOR PAID IN FULL'] },
    avatar: { seedBase: 'r', style: 'pixel-art', background: ['2a2342', 'b4903c', '7c5cbf'], ring: 'brass' },
    sprite: 'scribe',
  },
  newspaper: {
    id: 'newspaper',
    label: 'Dispatch',
    description: 'A worn front page in a detective\u2019s pocket — columns, ink, and cold-case gravitas.',
    dark: false,
    family: 'watch',
    colors: {
      background: '#efe6d2',
      foreground: '#2a2418',
      card: '#f6efdc',
      border: '#c8b98f',
      primary: '#7d1f1f',
      primaryFg: '#f6efdc',
      secondary: '#e4d6b6',
      accent: '#5c6a2f',
      danger: '#a3382b',
      success: '#355c3a',
      muted: '#8a7c5e',
      mutedFg: '#63583f',
      heat: ['#e7d9b0', '#d4bd85', '#bf9f54', '#a07c2f', '#7c4d0e'],
    },
    font: FONTS.broadsheet,
    density: 'comfortable',
    radius: 0,
    texture: 'paper',
    meta: { author: 'The Press', since: '1887', tagline: 'Extra! Extra! All debts settled!' },
    sound: { toggle: 'type', paid: 'ding', error: 'error', hover: 'tick' },
    mascot: { key: 'detective', name: 'Det. Inkwell', role: 'Cold-Case Ledger', lines: ['THE PRINT NEVER LIES', 'FOLLOW THE PAPER TRAIL', 'CASE 0042: CLOSED'] },
    avatar: { seedBase: 'd', style: 'pixel-art', background: ['e4d6b6', '7d1f1f', 'c8b98f'], ring: 'brass' },
    sprite: 'detective',
  },
  // ---- Newspaper edition themes (from "The Ledger" print edition) ----
  'morning-edition': {
    id: 'morning-edition',
    label: 'Morning Edition',
    description: 'Fresh paper, black-ink masthead, Playfair Display SC headlines — the morning read.',
    dark: false,
    family: 'watch',
    colors: {
      background: '#f0e6d2',
      foreground: '#2c1810',
      card: '#f5edd8',
      border: '#c4a882',
      primary: '#1a0f0a',
      primaryFg: '#f0e6d2',
      secondary: '#e8dcc4',
      accent: '#8b4513',
      danger: '#8b2500',
      success: '#2d5a1e',
      muted: '#7a6652',
      mutedFg: '#5c4a3a',
      heat: ['#e8dcc4', '#d4c4a0', '#b8a47a', '#9a8560', '#7a6848'],
    },
    font: FONTS.broadsheet,
    density: 'compact',
    radius: 0,
    texture: 'paper',
    meta: { author: 'The Ledger', since: '2025', tagline: 'Neither a borrower nor a lender be.' },
    sound: { toggle: 'type', paid: 'ding', error: 'error', hover: 'tick' },
    mascot: { key: 'scribe', name: 'Editor Prime', role: 'Front Page', lines: ['EXTRA! EXTRA!', '84 SETTLED THIS MONTH', 'FOLLOW THE MONEY'] },
    avatar: { seedBase: 'm', style: 'pixel-art', background: ['f5edd8', '1a0f0a', '8b4513'], ring: 'brass' },
    sprite: 'scribe',
  },
  'evening-gazette': {
    id: 'evening-gazette',
    label: 'Evening Gazette',
    description: 'The dusk edition — ember-light paper, warm columns, an oil-lamp read by lamplight.',
    dark: true,
    family: 'watch',
    colors: {
      background: '#1a1410',
      foreground: '#d4c4a8',
      card: '#221c14',
      border: '#4a3c2a',
      primary: '#d4c4a8',
      primaryFg: '#1a1410',
      secondary: '#2a2218',
      accent: '#c4944a',
      danger: '#c45a3a',
      success: '#6aaa4a',
      muted: '#7a6a52',
      mutedFg: '#9a8a6e',
      heat: ['#2a2218', '#3a3020', '#5a4a30', '#7a6840', '#a08850'],
    },
    font: FONTS.broadsheet,
    density: 'comfortable',
    radius: 0,
    texture: 'paper',
    meta: { author: 'The Gazette', since: '2025', tagline: 'Set by sunset, read by candlelight.' },
    sound: { toggle: 'type', paid: 'chime', error: 'error', hover: 'whoosh' },
    mascot: { key: 'detective', name: 'Inkwell', role: 'Night Desk', lines: ['THE LAMP IS LIT', 'DEBTS SETTLED BY DUSK', 'FOLLOW THE COLUMNS'] },
    avatar: { seedBase: 'e', style: 'pixel-art', background: ['221c14', 'd4c4a8', 'c4944a'], ring: 'brass' },
    sprite: 'detective',
  },
  'broadsheet-blue': {
    id: 'broadsheet-blue',
    label: 'Broadsheet Blue',
    description: 'Cobalt-on-cream editorial — the financial page, drawn in drafting ink.',
    dark: false,
    family: 'watch',
    colors: {
      background: '#dce4ec',
      foreground: '#1a2030',
      card: '#e4eaf2',
      border: '#a0b0c4',
      primary: '#1a2030',
      primaryFg: '#dce4ec',
      secondary: '#c8d4e4',
      accent: '#2a5080',
      danger: '#8a2a1a',
      success: '#1a5a2a',
      muted: '#6a7a8a',
      mutedFg: '#4a5a6a',
      heat: ['#d8e2ee', '#c0d0e2', '#98b0cc', '#7090b4', '#4a7098'],
    },
    font: FONTS.broadsheet,
    density: 'comfortable',
    radius: 2,
    texture: 'grid',
    meta: { author: 'The BroadSheet', since: '2025', tagline: 'Drawn in cobalt, set in stone.' },
    sound: { toggle: 'click', paid: 'ding', error: 'error', hover: 'tick' },
    mascot: { key: 'builder', name: 'Pressman Blue', role: 'Compositor', lines: ['SET IN 9PT COBALT', 'PRINTING THE LEDGER', 'ALL COLUMNS JUSTIFIED'] },
    avatar: { seedBase: 'bs', style: 'pixel-art', background: ['c8d4e4', '1a2030', '2a5080'], ring: 'primary' },
    sprite: 'builder',
  },
  'tabloid-gold': {
    id: 'tabloid-gold',
    label: 'Tabloid Gold',
    description: 'Sun-gilt tabloid — quick lines, warm gold ink, the morning’s money read.',
    dark: false,
    family: 'watch',
    colors: {
      background: '#f5e8c8',
      foreground: '#2a1a08',
      card: '#f8eed4',
      border: '#c8a868',
      primary: '#2a1a08',
      primaryFg: '#f5e8c8',
      secondary: '#ece0c0',
      accent: '#a06020',
      danger: '#982818',
      success: '#3a6a1a',
      muted: '#8a7050',
      mutedFg: '#6a5838',
      heat: ['#ece0c0', '#d8c898', '#c0a870', '#a08850', '#806838'],
    },
    font: FONTS.broadsheet,
    density: 'compact',
    radius: 0,
    texture: 'paper',
    meta: { author: 'The Tabloid', since: '2025', tagline: 'Sun-up, cash-up.' },
    sound: { toggle: 'tick', paid: 'coin', error: 'error', hover: 'whoosh' },
    mascot: { key: 'guard', name: 'Sunrise Tom', role: 'Circulation', lines: ['GOLD INK, CLEAR BOOKS', 'THE MORNING MONEY', 'ALL PAID BY FIRST LIGHT'] },
    avatar: { seedBase: 'tg', style: 'pixel-art', background: ['f8eed4', '2a1a08', 'a06020'], ring: 'accent' },
    sprite: 'guard',
  },
  'gazette-noir': {
    id: 'gazette-noir',
    label: 'Gazette Noir',
    description: 'Midnight broadsheet — film-noir ink, faint cream letters on true black.',
    dark: true,
    family: 'watch',
    colors: {
      background: '#0a0a0a',
      foreground: '#c8c0b0',
      card: '#141414',
      border: '#2a2a2a',
      primary: '#c8c0b0',
      primaryFg: '#0a0a0a',
      secondary: '#1c1c1c',
      accent: '#c8a060',
      danger: '#c85040',
      success: '#50a040',
      muted: '#5a5a52',
      mutedFg: '#7a7a70',
      heat: ['#181818', '#222220', '#30302c', '#404038', '#58584c'],
    },
    font: FONTS.broadsheet,
    density: 'comfortable',
    radius: 0,
    texture: 'carbon',
    meta: { author: 'Noir Press', since: '2025', tagline: 'The night desk keeps the ledger.' },
    sound: { toggle: 'thock', paid: 'beep', error: 'error', hover: 'tick' },
    mascot: { key: 'bot', name: 'Fedora-9', role: 'Night Compositor', lines: ['THE DARK ROOM DEVELOPS', 'DEBT, DEVELOPED IN BLACK', 'NOIR: ALL DUES FILED'] },
    avatar: { seedBase: 'gn', style: 'pixel-art', background: ['141414', 'c8c0b0', 'c8a060'], ring: 'brass' },
    sprite: 'bot',
  },
}

export const THEME_LIST: ThemeDefinition[] = Object.values(THEMES)

// ---- Theme store ----
interface ThemeState {
  themeId: ThemeId
  fontOverride: string | null // allow custom font pairing per theme
  densityOverride: 'compact' | 'comfortable' | 'spacious' | null
  radiusOverride: number | null
  accentOverride: string | null
  textureOverride: string | null
  setTheme: (id: ThemeId) => void
  setFontOverride: (key: string | null) => void
  setDensityOverride: (d: ThemeState['densityOverride']) => void
  setRadiusOverride: (r: number | null) => void
  setAccentOverride: (c: string | null) => void
  setTextureOverride: (t: string | null) => void
  resetOverrides: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: 'sepia',
      fontOverride: null,
      densityOverride: null,
      radiusOverride: null,
      accentOverride: null,
      textureOverride: null,
      setTheme: (id) => set({ themeId: id }),
      setFontOverride: (key) => set({ fontOverride: key }),
      setDensityOverride: (d) => set({ densityOverride: d }),
      setRadiusOverride: (r) => set({ radiusOverride: r }),
      setAccentOverride: (c) => set({ accentOverride: c }),
      setTextureOverride: (t) => set({ textureOverride: t }),
      resetOverrides: () =>
        set({ fontOverride: null, densityOverride: null, radiusOverride: null, accentOverride: null, textureOverride: null }),
    }),
    {
      name: 'guardpay-theme',
      version: 1,
      migrate: (persisted) => persisted as ThemeState,
    },
  ),
)

/** Options snapshot for resolving a theme without reading the store directly. */
export interface ResolveParams {
  themeId: ThemeId
  fontOverride: string | null
  densityOverride: 'compact' | 'comfortable' | 'spacious' | null
  radiusOverride: number | null
  accentOverride: string | null
  textureOverride: string | null
}

/** Resolve the effective theme definition, merging localized overrides. */
export function resolveTheme(params?: ResolveParams): ThemeDefinition {
  const s = params ?? useThemeStore.getState()
  const base = THEMES[s.themeId]
  if (
    !s.fontOverride &&
    !s.densityOverride &&
    s.radiusOverride === null &&
    !s.accentOverride &&
    !s.textureOverride
  ) {
    return base
  }
  const merged: ThemeDefinition = {
    ...base,
    colors: { ...base.colors },
    font: s.fontOverride ? (FONTS[s.fontOverride as keyof typeof FONTS] ?? base.font) : base.font,
    density: s.densityOverride ?? base.density,
    radius: s.radiusOverride ?? base.radius,
    texture: (s.textureOverride as ThemeDefinition['texture']) ?? base.texture,
  }
  if (s.accentOverride) merged.colors.accent = s.accentOverride
  return merged
}