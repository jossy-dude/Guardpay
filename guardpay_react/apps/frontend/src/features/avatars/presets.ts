'use client'

import type { AvatarConfig } from './engine'

export const SKIN_TONES = [
  { label: 'Light', hex: '#ffdbb4' },
  { label: 'Tan', hex: '#edb98a' },
  { label: 'Medium', hex: '#d08b5b' },
  { label: 'Brown', hex: '#ae5d29' },
  { label: 'Dark', hex: '#614335' },
]

export const HAIR_COLORS = [
  { label: 'Black', hex: '#2c1b18' },
  { label: 'Brown', hex: '#724133' },
  { label: 'Auburn', hex: '#a55728' },
  { label: 'Blonde', hex: '#b58143' },
  { label: 'Red', hex: '#c93305' },
  { label: 'Gray', hex: '#e8e1e1' },
]

export const HEADWEARS = [
  { label: 'Hair', top: 'shortRound' },
  { label: 'Hijab', top: 'hijab' },
  { label: 'Turban', top: 'turban' },
  { label: 'Cap', top: 'hat' },
  { label: 'Winter hat', top: 'winterHat1' },
]

export interface AvatarPreset {
  label: string
  config: AvatarConfig
}

const base = (top: string, skin: string, hair = '#2c1b18', hat = '#262e33'): AvatarConfig => ({
  top,
  skin,
  hair,
  hat,
  facialHair: 'none',
  glasses: 'none',
  eyes: 'happy',
  mouth: 'smile',
  eyebrows: 'defaultNatural',
  clothes: 'shirtCrewNeck',
  clothesColor: '#5199e4',
})

const withFacialHair = (c: AvatarConfig, facialHair: string): AvatarConfig => ({ ...c, facialHair })
const withGlasses = (c: AvatarConfig, glasses: string): AvatarConfig => ({ ...c, glasses })

export const PRESET_GROUPS: { title: string; presets: AvatarPreset[] }[] = [
  {
    title: 'Men',
    presets: [
      { label: 'Clean shaven', config: base('shortRound', '#d08b5b') },
      { label: 'Buzz cut', config: base('shortFlat', '#ffdbb4') },
      { label: 'Short + beard', config: withFacialHair(base('shortWaved', '#ae5d29'), 'beardLight') },
      { label: 'Cap + beard', config: withFacialHair(base('hat', '#d08b5b', '#2c1b18', '#5199e4'), 'beardMedium') },
      { label: 'Kufi + beard', config: withFacialHair(withGlasses(base('turban', '#ae5d29'), 'round'), 'beardMajestic') },
      { label: 'Winter hat', config: withFacialHair(base('winterHat1', '#ffdbb4'), 'moustacheFancy') },
      { label: 'Elder · glasses', config: withGlasses(withFacialHair(base('shortWaved', '#614335', '#e8e1e1'), 'beardMajestic'), 'prescription01') },
      { label: 'Sides + beard', config: withFacialHair(base('sides', '#edb98a'), 'beardMedium') },
      { label: 'Afro + shades', config: withGlasses(base('fro', '#614335'), 'sunglasses') },
      { label: 'Shaved sides', config: base('shavedSides', '#d08b5b') },
    ],
  },
  {
    title: 'Women',
    presets: [
      { label: 'Hijab · light', config: base('hijab', '#ffdbb4', '#2c1b18', '#262e33') },
      { label: 'Hijab · brown', config: withGlasses(base('hijab', '#ae5d29', '#2c1b18', '#5199e4'), 'round') },
      { label: 'Hijab · dark', config: base('hijab', '#614335', '#2c1b18', '#65c9ff') },
      { label: 'Long hair', config: base('bigHair', '#d08b5b') },
      { label: 'Bun', config: base('bun', '#ae5d29') },
      { label: 'Braids', config: base('dreads', '#614335') },
      { label: 'Curls', config: base('curly', '#ae5d29') },
      { label: 'Straight', config: base('straight01', '#ffdbb4') },
      { label: 'Bob', config: base('bob', '#edb98a') },
      { label: 'Fro + glasses', config: withGlasses(base('froBand', '#614335'), 'prescription02') },
    ],
  },
  {
    title: 'Headwear',
    presets: [
      { label: 'Turban', config: withFacialHair(base('turban', '#d08b5b', '#2c1b18', '#c93305'), 'beardLight') },
      { label: 'Cap', config: base('hat', '#614335', '#2c1b18', '#25557c') },
      { label: 'Winter hat', config: base('winterHat03', '#edb98a', '#a55728', '#ff488e') },
      { label: 'Hijab · elder', config: withGlasses(base('hijab', '#d08b5b', '#e8e1e1', '#3c4c5c'), 'prescription01') },
      { label: 'Shades + beard', config: withFacialHair(withGlasses(base('shortWaved', '#d08b5b'), 'sunglasses'), 'beardLight') },
    ],
  },
]
