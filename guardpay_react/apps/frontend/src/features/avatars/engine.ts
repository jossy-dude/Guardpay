'use client'

import { Style } from '@dicebear/core'
import avataaars from '@dicebear/styles/avataaars.json' with { type: 'json' }

export interface AvatarConfig {
  top: string
  skin: string
  hair: string
  hat: string
  facialHair: string
  glasses: string
  eyes: string
  mouth: string
  eyebrows: string
  clothes: string
  clothesColor: string
}

export const AVATAAARS_STYLE = new Style(avataaars)

export const DEFAULT_CONFIG: AvatarConfig = {
  top: 'shortRound',
  skin: '#d08b5b',
  hair: '#2c1b18',
  hat: '#262e33',
  facialHair: 'none',
  glasses: 'none',
  eyes: 'happy',
  mouth: 'smile',
  eyebrows: 'defaultNatural',
  clothes: 'shirtCrewNeck',
  clothesColor: '#5199e4',
}

export function parseAvatarConfig(json: string | null | undefined): AvatarConfig | null {
  if (!json) return null
  try {
    const raw: unknown = JSON.parse(json)
    if (typeof raw !== 'object' || raw === null) return null
    const o = raw as Record<string, unknown>
    if (typeof o.top !== 'string' || typeof o.skin !== 'string' || typeof o.hair !== 'string') return null
    return {
      top: o.top,
      skin: o.skin,
      hair: o.hair,
      hat: typeof o.hat === 'string' ? o.hat : DEFAULT_CONFIG.hat,
      facialHair: typeof o.facialHair === 'string' ? o.facialHair : 'none',
      glasses: typeof o.glasses === 'string' ? o.glasses : 'none',
      eyes: typeof o.eyes === 'string' ? o.eyes : DEFAULT_CONFIG.eyes,
      mouth: typeof o.mouth === 'string' ? o.mouth : DEFAULT_CONFIG.mouth,
      eyebrows: typeof o.eyebrows === 'string' ? o.eyebrows : DEFAULT_CONFIG.eyebrows,
      clothes: typeof o.clothes === 'string' ? o.clothes : DEFAULT_CONFIG.clothes,
      clothesColor: typeof o.clothesColor === 'string' ? o.clothesColor : DEFAULT_CONFIG.clothesColor,
    }
  } catch {
    return null
  }
}

export function toConfigString(config: AvatarConfig): string {
  return JSON.stringify(config)
}

export function buildOptions(config: AvatarConfig, seed: string, name: string): Record<string, unknown> {
  const opts: Record<string, unknown> = {
    seed,
    title: `Avatar for ${name}`,
    borderRadius: 50,
    idRandomization: true,
    topVariant: config.top,
    skinColor: config.skin,
    hairColor: config.hair,
    hatColor: config.hat,
    eyesVariant: config.eyes,
    mouthVariant: config.mouth,
    eyebrowsVariant: config.eyebrows,
    clothesVariant: config.clothes,
    clothesColor: config.clothesColor,
  }
  if (config.facialHair !== 'none') {
    opts.facialHairVariant = config.facialHair
    opts.facialHairColor = '#2c1b18'
  } else {
    opts.facialHairProbability = 0
  }
  if (config.glasses !== 'none') {
    opts.accessoriesVariant = config.glasses
    opts.accessoriesColor = '#262e33'
  } else {
    opts.accessoriesProbability = 0
  }
  return opts
}

const TOP_POOL = [
  'shortRound', 'shortFlat', 'shortWaved', 'theCaesar', 'sides', 'shavedSides',
  'bigHair', 'bob', 'bun', 'curly', 'curvy', 'straight01', 'longButNotTooLong',
  'fro', 'froBand', 'dreads', 'hijab', 'turban', 'hat', 'winterHat1',
]
const SKIN_POOL = ['#ffdbb4', '#edb98a', '#d08b5b', '#ae5d29', '#614335']
const HAIR_POOL = ['#2c1b18', '#724133', '#a55728', '#b58143', '#c93305', '#e8e1e1']
const BEARD_POOL = ['none', 'none', 'beardLight', 'beardMedium', 'beardMajestic', 'moustacheFancy']
const GLASS_POOL = ['none', 'none', 'none', 'round', 'prescription01', 'sunglasses']
const EYES_POOL = ['happy', 'happy', 'wink', 'default', 'squint', 'surprised']
const MOUTH_POOL = ['smile', 'smile', 'default', 'serious', 'tongue', 'grimace']
const CLOTHES_POOL = ['shirtCrewNeck', 'shirtScoopNeck', 'shirtVNeck', 'hoodie', 'blazer', 'overall']
const CLOTHES_COLOR_POOL = ['#5199e4', '#262e33', '#ff488e', '#65c9ff', '#c93305', '#25557c']

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

export function randomConfig(): AvatarConfig {
  const top = pick(TOP_POOL)
  const hat = pick(['#262e33', '#5199e4', '#25557c', '#c93305', '#65c9ff', '#3c4f5c'])
  return {
    top,
    skin: pick(SKIN_POOL),
    hair: pick(HAIR_POOL),
    hat,
    facialHair: pick(BEARD_POOL),
    glasses: pick(GLASS_POOL),
    eyes: pick(EYES_POOL),
    mouth: pick(MOUTH_POOL),
    eyebrows: 'defaultNatural',
    clothes: pick(CLOTHES_POOL),
    clothesColor: pick(CLOTHES_COLOR_POOL),
  }
}
