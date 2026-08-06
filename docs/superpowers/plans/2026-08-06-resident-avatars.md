# Resident Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pixel resident avatars with a real, selectable, customizable avatar system (DiceBear avataaars) that persists per-household and opens a picker from any resident avatar in the app.

**Architecture:** Backend stores a compact JSON `avatar` config string on the `Household` row (rides along in `/state` and DB backups). Frontend renders faces purely client-side with `@dicebear/core` (avataaars style), maps the config into DiceBear options, shows a neutral initial-letter placeholder for unset houses, and opens a shared picker (zustand store + existing `Dialog`) with a curated preset grid, quick-customize controls, randomize, reset, and spring/click motion + sound.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Alembic (backend); React 19 + Vite 8 + TS 6 + zustand 5 + TanStack Query 5 + framer-motion 12 (frontend); `@dicebear/core` + `@dicebear/styles`.

## Global Constraints

- Verification commands (this repo has **no unit-test runner** — the previous phases used these):
  - Backend: `cd apps/backend && .venv/bin/python -c "import app.main"` (imports) and live `curl` against the running server on `:8420`.
  - Frontend: `cd apps/frontend && npx tsc -b` (0 errors) then `npx vite build` (clean) then `npx oxlint` (no new warnings).
- Server start for live checks:
  `cd apps/backend && setsid nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8420 > /tmp/gp-uvicorn.log 2>&1 & disown`
  (verify with `curl -s http://localhost:8420/api/health`).
- All avatar rendering is client-side; **no runtime network calls** to DiceBear (only the bundled style JSON). No new runtime deps beyond `@dicebear/core` + `@dicebear/styles`.
- License: avataaars is "Free for personal and commercial use" (Pablo Stanley) — add a credit line in the picker footer and Settings.
- `prefers-reduced-motion` respected via the root `MotionConfig reducedMotion="user"`; keyboard `:focus-visible` rings retained.
- TS strict + `verbatimModuleSyntax` (use `import type` for types) + `erasableSyntaxOnly` (no enums) + `noUncheckedIndexedAccess` (guard array index access).
- Config string validation: invalid JSON → HTTP 422 from Pydantic.

---

## File Structure

**Backend**
- Modify: `apps/backend/app/models/__init__.py` — add `avatar` column to `Household`.
- Modify: `apps/backend/app/schemas/__init__.py` — `avatar` on `HouseCreate`/`HouseUpdate`/`HouseOut` + JSON validator.
- Modify: `apps/backend/app/api/houses.py` — set/persist `avatar` in create/update; include in list serialization.
- Modify: `apps/backend/app/api/state.py` — include `avatar` in `/state` house serialization.
- Create: `apps/backend/alembic/versions/a3f7c9e2b1d4_add_house_avatar_column.py`.

**Frontend**
- Modify: `apps/frontend/src/lib/types.ts` — `avatar` on `Household`/`ApiHousehold`; delete `AvatarTheme`.
- Modify: `apps/frontend/src/features/payments/dataStore.ts` — map `avatar` in `setState`.
- Modify: `apps/frontend/tsconfig.app.json` — add `resolveJsonModule`.
- Create: `apps/frontend/src/features/avatars/engine.ts` — `AvatarConfig`, parse/build/random helpers.
- Create: `apps/frontend/src/features/avatars/presets.ts` — skin tones, hair colors, headwear options, 24+ curated presets.
- Create: `apps/frontend/src/features/avatars/pickerStore.ts` — which house's picker is open.
- Create: `apps/frontend/src/components/shared/ResidentAvatar.tsx` — renders face or placeholder; pressable button when `onClick` given.
- Modify: `apps/frontend/src/components/shared/overlay/Dialog.tsx` — add optional `panelClassName`.
- Create: `apps/frontend/src/components/shared/AvatarPicker.tsx` — the picker dialog.
- Modify: `apps/frontend/src/pages/RecordsPage.tsx`, `pages/LeaderboardPage.tsx`, `pages/DashboardPage.tsx`, `pages/SettingsPage.tsx` — swap in `ResidentAvatar`, wire clicks.
- Delete: `apps/frontend/src/components/shared/PixelAvatar.tsx`; remove `avatar` theme fields from `features/theming/themes.ts`.

---

### Task 1: Backend — `avatar` column + API

**Files:**
- Modify: `apps/backend/app/models/__init__.py:39-57` (Household)
- Modify: `apps/backend/app/schemas/__init__.py` (HouseCreate/HouseUpdate/HouseOut)
- Modify: `apps/backend/app/api/houses.py` (create_house, update_house, list_houses)
- Modify: `apps/backend/app/api/state.py` (house serialization)
- Create: `apps/backend/alembic/versions/a3f7c9e2b1d4_add_house_avatar_column.py`

**Interfaces:**
- Produces: `Household.avatar: str | None`; API accepts/returns `avatar: str | None` on house create/update/list/state; HTTP 422 on non-JSON `avatar`.

- [ ] **Step 1: Add the model column**

In `apps/backend/app/models/__init__.py`, add to `Household` (after `deleted_at`, line 55):

```python
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)
```

- [ ] **Step 2: Extend the schemas with JSON validation**

In `apps/backend/app/schemas/__init__.py`, add `import json` at the top (after the existing pydantic import block), then add `avatar` + a validator to `HouseCreate` (line ~14), `HouseUpdate` (line ~21), and `HouseOut` (line ~30):

```python
class HouseCreate(BaseModel):
    name: str = Field(min_length=1)
    house_number: str = Field(min_length=1)
    fee: int = Field(default=4000, ge=0)
    notes: str = ""
    avatar: str | None = None

    @field_validator("avatar")
    @classmethod
    def _validate_avatar(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        try:
            parsed = json.loads(v)
        except json.JSONDecodeError as exc:
            raise ValueError("avatar must be a JSON object string or null") from exc
        if not isinstance(parsed, dict):
            raise ValueError("avatar must be a JSON object string or null")
        return v
```

Apply the **same** field to `HouseUpdate` and `HouseOut` (same validator — repeat it in full; the engineer may read tasks out of order). Ensure `field_validator` is imported (pydantic ≥2: `from pydantic import BaseModel, Field, field_validator`).

- [ ] **Step 3: Persist avatar in the routes**

In `apps/backend/app/api/houses.py`:

- In `list_houses`, add `"avatar": h.avatar,` to the returned dict (after `"deleted_at"`).
- In `create_house`, add `avatar=data.avatar,` to the `Household(...)` constructor.
- In `update_house`, add `house.avatar = data.avatar` (near `house.notes = data.notes`, line ~167).
- In `state.py`, add `"avatar": h.avatar,` to the house dict in `get_state` (after `"deleted_at"`).

- [ ] **Step 4: Write and apply the Alembic migration**

Create `apps/backend/alembic/versions/a3f7c9e2b1d4_add_house_avatar_column.py` (match the style of `d0e2f7b1a4c3`):

```python
"""add nullable avatar config column to houses

Revision ID: a3f7c9e2b1d4
Revises: d0e2f7b1a4c3
Create Date: 2026-08-06 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f7c9e2b1d4'
down_revision: Union[str, None] = 'd0e2f7b1a4c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("houses", sa.Column("avatar", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("houses", "avatar")
```

Then apply it (with the live server running) and restart:

Run: `cd apps/backend && .venv/bin/alembic upgrade head`
Expected: `Running upgrade d0e2f7b1a4c3 -> a3f7c9e2b1d4` and `OK`. Then restart uvicorn (kill the pid on :8420 and relaunch with the command in Global Constraints).

- [ ] **Step 5: Verify the API end-to-end**

Run:
```bash
curl -s http://localhost:8420/api/state | python3 -c "import sys,json; d=json.load(sys.stdin); print([ (h['id'], h['avatar']) for h in d['houses'][:3] ])"
curl -s -X POST http://localhost:8420/api/houses -H 'Content-Type: application/json' -d '{"name":"AVTest","house_number":"AV99","fee":4000,"avatar":"{\"top\":\"hijab\",\"skin\":\"#edb98a\"}"}' | head -c 200
curl -s -X PUT http://localhost:8420/api/houses/update -H 'Content-Type: application/json' -d '{"id":1,"name":"V1","house_number":"1","fee":500,"notes":"","active":true,"avatar":"not-json"}' | head -c 300
```
Expected: `/state` shows `avatar: None` for existing rows; create succeeds and returns `{"ok": true, "id": ...}`; the invalid-JSON update returns HTTP 422 (FastAPI validation). Then delete the AV99 test row:
```bash
curl -s -X POST http://localhost:8420/api/houses/delete -H 'Content-Type: application/json' -d '{"id":<AV99 id>}'
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend
git commit -m "feat(backend): persist per-house avatar config"
```

---

### Task 2: Frontend — data plumbing + tsconfig

**Files:**
- Modify: `apps/frontend/src/lib/types.ts:3-14` (Household), `:121-132` (ApiHousehold), `:245-251` (delete AvatarTheme)
- Modify: `apps/frontend/src/features/payments/dataStore.ts:71-84` (setState house mapping)
- Modify: `apps/frontend/tsconfig.app.json` (add resolveJsonModule)

**Interfaces:**
- Produces: `Household.avatar: string | null`, `ApiHousehold.avatar: string | null`; `useDataStore.setState` populates `houses[].avatar` from the API.

- [ ] **Step 1: Extend the types**

In `apps/frontend/src/lib/types.ts`:

- Add `avatar: string | null` to `Household` (after `deletedAt`).
- Add `avatar: string | null` to `ApiHousehold` (after `deleted_at`).
- Delete the `AvatarTheme` interface (lines 245-251) and its doc comment.

- [ ] **Step 2: Map the field in the data store**

In `apps/frontend/src/features/payments/dataStore.ts` `setState` house mapping (line ~73-84), add after `deletedAt: h.deleted_at,`:

```ts
        avatar: h.avatar ?? null,
```

- [ ] **Step 3: Enable JSON module imports**

In `apps/frontend/tsconfig.app.json`, add `"resolveJsonModule": true,` to `compilerOptions` (alphabetical, after `"moduleResolution"`).

- [ ] **Step 4: Verify + commit**

Run: `cd apps/frontend && npx tsc -b`
Expected: PASS (0 errors; `resolveJsonModule` is required by the DiceBear JSON import in Task 3, added now so the next task typechecks).
Commit: `git add apps/frontend/src/lib/types.ts apps/frontend/src/features/payments/dataStore.ts apps/frontend/tsconfig.app.json && git commit -m "feat(frontend): plumb house avatar into store types"`

---

### Task 3: DiceBear engine + presets

**Files:**
- Modify: `apps/frontend/package.json` (deps)
- Create: `apps/frontend/src/features/avatars/engine.ts`
- Create: `apps/frontend/src/features/avatars/presets.ts`

**Interfaces:**
- Produces (from `engine.ts`):
  - `export interface AvatarConfig { top: string; skin: string; hair: string; hat: string; facialHair: string; glasses: string; eyes: string; mouth: string; eyebrows: string; clothes: string; clothesColor: string }`
  - `export const DEFAULT_CONFIG: AvatarConfig`
  - `export function parseAvatarConfig(json: string | null | undefined): AvatarConfig | null`
  - `export function toConfigString(config: AvatarConfig): string`
  - `export function buildOptions(config: AvatarConfig, seed: string, name: string): Record<string, unknown>`
  - `export function randomConfig(): AvatarConfig`
  - `export const AVATAAARS_STYLE` (memoized `Style` instance)
- Produces (from `presets.ts`):
  - `export const SKIN_TONES: { label: string; hex: string }[]`
  - `export const HAIR_COLORS: { label: string; hex: string }[]`
  - `export const HEADWEARS: { label: string; top: string }[]`
  - `export interface AvatarPreset { label: string; config: AvatarConfig }`
  - `export const PRESET_GROUPS: { title: string; presets: AvatarPreset[] }[]`

- [ ] **Step 1: Install DiceBear**

Run: `cd apps/frontend && pnpm add @dicebear/core @dicebear/styles`
Expected: packages installed and added to `package.json` (this repo uses `pnpm` — see `pnpm-lock.yaml`).

- [ ] **Step 2: Write the engine**

Create `apps/frontend/src/features/avatars/engine.ts`:

```ts
'use client'

import { Avatar, Style } from '@dicebear/core'
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
```

- [ ] **Step 3: Write the presets**

Create `apps/frontend/src/features/avatars/presets.ts`:

```ts
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
const withClothes = (c: AvatarConfig, clothes: string, clothesColor: string): AvatarConfig => ({ ...c, clothes, clothesColor })

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
```

- [ ] **Step 4: Verify + commit**

Run: `cd apps/frontend && npx tsc -b && npx vite build`
Expected: PASS, 0 errors. (If TS complains about the `with { type: 'json' }` import, `resolveJsonModule` from Task 2 covers it; if it still errors, switch to `import avataaars from '@dicebear/styles/avataaars.json'` without the attribute.)
Commit: `git add apps/frontend/package.json apps/frontend/pnpm-lock.yaml apps/frontend/src/features/avatars && git commit -m "feat(frontend): dicebear avatar engine and curated presets"`

---

### Task 4: ResidentAvatar component

**Files:**
- Create: `apps/frontend/src/components/shared/ResidentAvatar.tsx`

**Interfaces:**
- Consumes: `AvatarConfig`, `parseAvatarConfig`, `buildOptions`, `AVATAAARS_STYLE` from `engine.ts`; `Household` type; `cn`.
- Produces:
  - `export function ResidentAvatar({ house, size = 36, ring = true, className, onClick }: { house: Pick<Household, 'id' | 'name' | 'avatar'>; size?: number; ring?: boolean; className?: string; onClick?: () => void })`
  - Renders the DiceBear face as inline SVG when `house.avatar` parses; otherwise a muted circle with the house initial. When `onClick` is provided it renders a `motion.button` with a press scale; otherwise a `span`.

- [ ] **Step 1: Write the component**

Create `apps/frontend/src/components/shared/ResidentAvatar.tsx`:

```tsx
'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@dicebear/core'
import { AVATAAARS_STYLE, buildOptions, parseAvatarConfig } from '@/features/avatars/engine'
import type { Household } from '@/lib/types'
import { cn } from '@/lib/cn'
import { pressSpring } from '@/lib/motion'

export function ResidentAvatar({
  house,
  size = 36,
  ring = true,
  className,
  onClick,
}: {
  house: Pick<Household, 'id' | 'name' | 'avatar'>
  size?: number
  ring?: boolean
  className?: string
  onClick?: () => void
}) {
  const config = useMemo(() => parseAvatarConfig(house.avatar), [house.avatar])
  const svg = useMemo(() => {
    if (!config) return null
    // `buildOptions` returns a loose Record; DiceBear's options type is a mapped
    // generic, so cast through the constructor parameter type to stay type-safe.
    const opts = buildOptions(config, `house-${house.id}`, house.name) as ConstructorParameters<typeof Avatar>[1]
    return new Avatar(AVATAAARS_STYLE, opts).toString()
  }, [config, house.id, house.name])

  const ringColor = ring ? 'var(--primary)' : undefined
  const boxShadow = ringColor ? `0 0 0 2px var(--bg), 0 0 0 3px ${ringColor}` : undefined

  const inner = (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full', className)}
      style={{ width: size, height: size, background: svg ? 'transparent' : 'var(--secondary)', boxShadow }}
      aria-hidden="true"
    >
      {svg ? (
        <span
          className="block h-full w-full"
          style={{ display: 'block' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <span
          className="font-display font-semibold leading-none text-[var(--muted)]"
          style={{ fontSize: size * 0.42 }}
        >
          {(house.name.trim()[0] ?? '?').toUpperCase()}
        </span>
      )}
    </span>
  )

  if (!onClick) return inner

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={pressSpring}
      aria-label={`Customize avatar for ${house.name}`}
      className={cn('cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]', className)}
    >
      {inner}
    </motion.button>
  )
}
```

- [ ] **Step 2: Verify + commit**

Run: `cd apps/frontend && npx tsc -b && npx vite build`
Expected: PASS, 0 errors.
Commit: `git add apps/frontend/src/components/shared/ResidentAvatar.tsx && git commit -m "feat(frontend): ResidentAvatar face/placeholder renderer"`

---

### Task 5: Picker store + Dialog width

**Files:**
- Create: `apps/frontend/src/features/avatars/pickerStore.ts`
- Modify: `apps/frontend/src/components/shared/overlay/Dialog.tsx:96` (panel class)

**Interfaces:**
- Produces: `export const useAvatarPicker: { house: Household | null; open: (h: Household) => void; close: () => void }`
- Produces: `Dialog` gains optional `panelClassName?: string` prop appended to the panel's className.

- [ ] **Step 1: Create the picker store**

Create `apps/frontend/src/features/avatars/pickerStore.ts`:

```ts
'use client'

import { create } from 'zustand'
import type { Household } from '@/lib/types'

interface AvatarPickerState {
  house: Household | null
  open: (house: Household) => void
  close: () => void
}

export const useAvatarPicker = create<AvatarPickerState>((set) => ({
  house: null,
  open: (house) => set({ house }),
  close: () => set({ house: null }),
}))
```

- [ ] **Step 2: Widen the Dialog for the picker**

In `apps/frontend/src/components/shared/overlay/Dialog.tsx`:
- Add `panelClassName` to the props type: `panelClassName?: string`.
- In the panel `motion.div`, change `className="w-full max-w-md ..."` to `className={cn('w-full max-w-md ...', panelClassName)}` (import `cn` from `@/lib/cn`).

- [ ] **Step 3: Verify + commit**

Run: `cd apps/frontend && npx tsc -b`
Expected: PASS, 0 errors.
Commit: `git add apps/frontend/src/features/avatars/pickerStore.ts apps/frontend/src/components/shared/overlay/Dialog.tsx && git commit -m "feat(frontend): avatar picker store + dialog width prop"`

---

### Task 6: AvatarPicker dialog

**Files:**
- Create: `apps/frontend/src/components/shared/AvatarPicker.tsx`

**Interfaces:**
- Consumes: `useAvatarPicker`, `Dialog`, `ResidentAvatar`, `SKIN_TONES`/`HAIR_COLORS`/`HEADWEARS`/`PRESET_GROUPS`, `AvatarConfig`/`parseAvatarConfig`/`toConfigString`/`randomConfig`/`DEFAULT_CONFIG`, `useHouseMutation`, `useSound`, `motion`/`pressSpring`/`stampSpring`/`staggerParent`/`staggerChild`.
- Produces: `export function AvatarPicker()` — a self-contained dialog; must be mounted once (in `App.tsx`).

- [ ] **Step 1: Write the picker**

Create `apps/frontend/src/components/shared/AvatarPicker.tsx`:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shuffle } from 'lucide-react'
import { Dialog } from '@/components/shared/overlay/Dialog'
import { ResidentAvatar } from '@/components/shared/ResidentAvatar'
import { useAvatarPicker } from '@/features/avatars/pickerStore'
import { parseAvatarConfig, toConfigString, randomConfig, DEFAULT_CONFIG, type AvatarConfig } from '@/features/avatars/engine'
import { HAIR_COLORS, HEADWEARS, PRESET_GROUPS, SKIN_TONES } from '@/features/avatars/presets'
import { useHouseMutation } from '@/lib/hooks'
import { useSound } from '@/hooks/useSound'
import { cn } from '@/lib/cn'
import { pressSpring, stampSpring, staggerChild, staggerParent } from '@/lib/motion'

export function AvatarPicker() {
  const house = useAvatarPicker((s) => s.house)
  const close = useAvatarPicker((s) => s.close)
  const { play } = useSound()
  const mutation = useHouseMutation()
  const [draft, setDraft] = useState<AvatarConfig | null>(null)

  useEffect(() => {
    if (house) setDraft(parseAvatarConfig(house.avatar))
  }, [house])

  const previewKey = useMemo(() => Math.random().toString(36).slice(2), [draft])

  if (!house) return null

  const previewHouse = { id: house.id, name: house.name, avatar: draft ? toConfigString(draft) : null }

  const selectPreset = (config: AvatarConfig) => {
    play('toggle')
    setDraft(config)
  }

  const patch = (part: Partial<AvatarConfig>) => {
    play('hover')
    setDraft((d) => ({ ...(d ?? DEFAULT_CONFIG), ...part }))
  }

  const save = () => {
    mutation.mutate(
      {
        id: house.id,
        name: house.name,
        house_number: house.houseNumber,
        fee: house.fee,
        notes: house.notes,
        active: house.active,
        avatar: draft ? toConfigString(draft) : null,
      },
      {
        onSuccess: () => {
          play('paid')
          close()
        },
      },
    )
  }

  const headwearCurrent = HEADWEARS.find((h) => h.top === draft?.top)?.top

  return (
    <Dialog
      open={!!house}
      onClose={close}
      title="Resident avatar"
      kicker={house.name}
      panelClassName="max-w-xl"
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              play('toggle')
              setDraft(null)
            }}
            className="mr-auto rounded-lg px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
          >
            Reset to default
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm transition hover:bg-[var(--border)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={mutation.isPending}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:opacity-60"
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Live preview */}
        <div className="flex items-center gap-4">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={previewKey}
              initial={{ scale: 0.6, rotate: -6 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={stampSpring}
            >
              <ResidentAvatar house={previewHouse} size={72} />
            </motion.div>
          </AnimatePresence>
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold">{house.name}</div>
            <div className="text-xs text-[var(--muted)]">
              {draft ? 'Customized face' : 'No face set — showing a placeholder.'}
            </div>
          </div>
        </div>

        {/* Curated grid */}
        <div className="max-h-56 space-y-4 overflow-y-auto pr-1">
          {PRESET_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                {group.title}
              </div>
              <motion.div {...staggerParent} className="grid grid-cols-5 gap-2">
                {group.presets.map((p) => {
                  const selected = draft ? toConfigString(draft) === toConfigString(p.config) : false
                  return (
                    <motion.button
                      key={p.label}
                      type="button"
                      {...staggerChild}
                      whileHover={{ y: -2, scale: 1.05 }}
                      whileTap={{ scale: 0.94 }}
                      transition={pressSpring}
                      onClick={() => selectPreset(p.config)}
                      className={cn(
                        'relative flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--primary)]',
                        selected ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:bg-[var(--border)]/60',
                      )}
                    >
                      {selected && (
                        <motion.span
                          layoutId="avatar-pick-ring"
                          transition={stampSpring}
                          className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-[var(--primary)]"
                        />
                      )}
                      <ResidentAvatar house={{ id: house.id, name: p.label, avatar: toConfigString(p.config) }} size={40} />
                      <span className="line-clamp-1 text-center text-[10px] leading-tight text-[var(--muted)]">{p.label}</span>
                    </motion.button>
                  )
                })}
              </motion.div>
            </div>
          ))}
        </div>

        {/* Customize */}
        <div className="space-y-3 rounded-lg border border-[var(--border)] p-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">Customize</div>

          <div>
            <div className="mb-1.5 text-xs font-medium">Skin tone</div>
            <div className="flex gap-1.5">
              {SKIN_TONES.map((s) => (
                <button
                  key={s.hex}
                  type="button"
                  onClick={() => patch({ skin: s.hex })}
                  aria-label={s.label}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition focus-visible:outline-2 focus-visible:outline-[var(--primary)]',
                    draft?.skin === s.hex ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/40' : 'border-transparent hover:scale-110',
                  )}
                  style={{ background: s.hex }}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium">Headwear</div>
            <div className="flex flex-wrap gap-1.5">
              {HEADWEARS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => patch({ top: h.top })}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition focus-visible:outline-2 focus-visible:outline-[var(--primary)]',
                    headwearCurrent === h.top ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]' : 'border-[var(--border)] hover:bg-[var(--border)]/60',
                  )}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium">Hair color</div>
            <div className="flex gap-1.5">
              {HAIR_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => patch({ hair: c.hex })}
                  aria-label={c.label}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition focus-visible:outline-2 focus-visible:outline-[var(--primary)]',
                    draft?.hair === c.hex ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/40' : 'border-transparent hover:scale-110',
                  )}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['glasses', 'facialHair'] as const).map((k) => {
              const on = (draft?.[k] ?? 'none') !== 'none'
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => patch({ [k]: on ? 'none' : k === 'glasses' ? 'round' : 'beardLight' })}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs capitalize transition focus-visible:outline-2 focus-visible:outline-[var(--primary)]',
                    on ? 'border-transparent bg-[var(--primary)] text-[var(--primary-fg)]' : 'border-[var(--border)] hover:bg-[var(--border)]/60',
                  )}
                >
                  {k === 'glasses' ? 'Glasses' : 'Beard'}
                </button>
              )
            })}
          </div>
        </div>

        {/* Random */}
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
          <button
            type="button"
            onClick={() => {
              play('toggle')
              setDraft(randomConfig())
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium transition hover:bg-[var(--border)]/60 focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
          >
            <Shuffle size={14} /> Random face
          </button>
          <span className="text-[10px] text-[var(--muted)]">Avatars by Pablo Stanley — Avataaars</span>
        </div>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 2: Mount the picker once**

In `apps/frontend/src/App.tsx`, import and render `<AvatarPicker />` once (e.g. right before the closing app wrapper). Verify the existing `App.tsx` structure with `grep -n "export function App" apps/frontend/src/App.tsx` first and place the render so it is always mounted (the dialog's `open` is controlled by the store).

- [ ] **Step 3: Verify + commit**

Run: `cd apps/frontend && npx tsc -b && npx vite build`
Expected: PASS, 0 errors.
Commit: `git add apps/frontend/src/components/shared/AvatarPicker.tsx apps/frontend/src/App.tsx && git commit -m "feat(frontend): avatar picker dialog with presets, customize, random"`

---

### Task 7: Surface swap + cleanup

**Files:**
- Modify: `apps/frontend/src/pages/RecordsPage.tsx` (~780, 791, 1420, 1583)
- Modify: `apps/frontend/src/pages/LeaderboardPage.tsx` (row mapping ~39-50, ~121, 124, 264)
- Modify: `apps/frontend/src/pages/DashboardPage.tsx` (603, 612)
- Modify: `apps/frontend/src/pages/SettingsPage.tsx` (385-393)
- Modify: `apps/frontend/src/features/theming/themes.ts` (remove `avatar` fields)
- Delete: `apps/frontend/src/components/shared/PixelAvatar.tsx`

**Interfaces:**
- Consumes: `ResidentAvatar`, `useAvatarPicker` (`useAvatarPicker.getState().open(house)` — no hook needed in leaf components).
- Produces: every non-toggle resident avatar opens the picker on click; the cover-card avatar at RecordsPage:1420 stays visual-only (it is nested inside a payment toggle `<button>` — a nested button is invalid).

- [ ] **Step 1: Swap RecordsPage**

Replace `import { PixelAvatar } from '@/components/shared/PixelAvatar'` with `import { ResidentAvatar } from '@/components/shared/ResidentAvatar'` and `import { useAvatarPicker } from '@/features/avatars/pickerStore'`.

- Line ~780 (HoverCard trigger, 26px): replace `<PixelAvatar id={house.id} name={house.name} size={26} />` with:
```tsx
<ResidentAvatar house={house} size={26} onClick={() => useAvatarPicker.getState().open(house)} />
```
- Line ~791 (HoverCard content, 44px): same with `size={44}` and the same onClick.
- Line ~1420 (cover card, 64px): replace with `<ResidentAvatar house={house} size={64} />` (no onClick — already inside a toggle button).
- Line ~1583 (table cell, 24px): same onClick pattern with `size={24}`.

- [ ] **Step 2: Swap LeaderboardPage**

Replace the `PixelAvatar` import with `ResidentAvatar` + `useAvatarPicker`.

- In the `rows` memo (line ~39-50), add `avatar: h.avatar,` to the mapped row object (so the row carries the avatar).
- In the `rows.map((row, idx) => ...)` render callback, capture the full household first:
```tsx
const house = useDataStore.getState().houses.find((x) => x.id === row.id)!
```
  (`useDataStore` is already imported; this reads the live household so the picker gets the current avatar.)
- Line ~121 (row avatar trigger, 40px): `<ResidentAvatar house={house} size={40} onClick={() => useAvatarPicker.getState().open(house)} />`
- Line ~124 (HoverCard content, 52px): same onClick with `size={52}`.
- Line ~264 (rename dialog, 44px): keep display-only `<ResidentAvatar house={house} size={44} />` and change the hint at line ~266 from "Avatar updates live as you change the resident name." to "Set this household's avatar from anywhere — just tap any resident avatar."

- [ ] **Step 3: Swap DashboardPage**

Replace the `PixelAvatar` import with `ResidentAvatar` + `useAvatarPicker`.

- Line ~603 (row, 34px): `<ResidentAvatar house={house} size={34} onClick={() => useAvatarPicker.getState().open(house)} />`
- Line ~612 (HoverCard content, 56px): `<ResidentAvatar house={house} size={56} ring={!paid} onClick={() => useAvatarPicker.getState().open(house)} />`

- [ ] **Step 4: Update SettingsPage**

Replace the `PixelAvatar` import with `ResidentAvatar`. At lines 385-388, replace the PixelAvatar preview + text with:

```tsx
<div className="mt-2 flex items-center gap-2">
  <ResidentAvatar house={{ id: 0, name: resolved.label, avatar: null }} size={26} />
  <span className="text-[11px] text-[var(--muted)]">Resident avatars are set per household — tap any avatar to customize it.</span>
</div>
```

And extend the paragraph at line ~391-393 with a credit: append " Resident avatars by Pablo Stanley — Avataaars." Remove the `resolved.avatar.style` reference (gone with the swap).

- [ ] **Step 5: Remove avatar theme fields + delete PixelAvatar**

- In `apps/frontend/src/features/theming/themes.ts`: remove `avatar: AvatarTheme` from the `Theme` interface (line ~107) and the `avatar: { ... }` line from all 13 theme definitions; remove the now-unused `import type { AvatarTheme }` (line 3).
- Delete `apps/frontend/src/components/shared/PixelAvatar.tsx`.
- Verify no lingering references: `cd apps/frontend/src && rg -n "PixelAvatar|\.avatar\b|AvatarTheme" --glob '*.ts' --glob '*.tsx'` should only show the new `ResidentAvatar` usages and `house.avatar`/`h.avatar`/`row.avatar`/`avatar:` data fields (not theme).

- [ ] **Step 6: Verify + commit**

Run: `cd apps/frontend && npx tsc -b && npx vite build && npx oxlint`
Expected: PASS, 0 errors, no new lint warnings.
Commit: `git add apps/frontend && git commit -m "feat(frontend): swap in selectable ResidentAvatars across pages"`

---

### Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Backend sanity**

Run:
```bash
curl -s http://localhost:8420/api/health
curl -s http://localhost:8420/api/state | python3 -c "import sys,json; d=json.load(sys.stdin); print('houses', len(d['houses']), 'avatar sample', d['houses'][0]['avatar'])"
```
Expected: health OK; state returns the `avatar` key on every house (null for existing data).

- [ ] **Step 2: Frontend build**

Run: `cd apps/frontend && npx tsc -b && npx vite build && npx oxlint`
Expected: all green.

- [ ] **Step 3: Manual e2e checklist** (serve `apps/frontend/dist` through the running uvicorn static handler at `http://localhost:8420`)

1. Existing households show the neutral initial-letter placeholder.
2. Click an avatar on the Dashboard → picker springs open with a press-scale on the trigger; panels stagger in; hijab/turban/presets visible.
3. Tap a preset → preview snaps; select another → selection ring springs to it (shared `layoutId`).
4. Toggle skin/headwear/hair color/glasses/beard → preview updates live; headwear shows Hijab/Turban/Cap/Winter hat/Hair.
5. 🎲 Random → new face; Reset to default → placeholder; Save → picker closes with a paid sound and the avatar persists after refresh.
6. Click the same avatar from Records, Leaderboard, and Reminders surfaces → same picker.
7. The Records cover-card avatar (toggle) still toggles payment and does not open the picker.
8. Settings Character section shows the new hint + credit; no "pixel" wording.
9. `prefers-reduced-motion: reduce` → picker opens without transform motion; keyboard: Tab reaches every control with visible focus rings, Esc closes.

- [ ] **Step 4: Commit any fixes** produced by the checklist as a follow-up commit (one per concern), then report completion.

---

## Self-Review

**Spec coverage:**
- §1 style/rendering → Task 3 (engine + presets) + Task 4 (ResidentAvatar, inline SVG, borderRadius 50, idRandomization, title).
- §2 data/persistence → Task 1 (column + API + migration) + Task 2 (frontend types/store; backups ride along automatically).
- §3 picker → Task 5 (store + Dialog width) + Task 6 (picker: presets grid, customize, random, reset, placeholder, sounds).
- §3 click animation & feel → Task 4 (trigger press scale) + Task 6 (stagger pop-in, hover lift, `layoutId` selection snap, save press).
- §4 surface swap/cleanup → Task 7 (swap + Settings + theme cleanup + delete PixelAvatar + credits).

**Placeholder scan:** no TBD/TODO; every code step contains full code.

**Type consistency:** `AvatarConfig` shape, `parseAvatarConfig`/`toConfigString`/`buildOptions`/`randomConfig`/`AVATAAARS_STYLE` names are used identically in Tasks 3, 4, 6. `useAvatarPicker` store shape (`house`/`open`/`close`) consistent across Tasks 5, 6, 7. `Dialog` `panelClassName` consistent between Task 5 and 6.
