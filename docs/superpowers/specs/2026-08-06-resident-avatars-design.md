# GuardPay Resident Avatars — Design Spec

Date: 2026-08-06 · Status: approved (brainstorming skill, all sections)

## Scope

Replace the hand-built pixel "resident avatar" system with a real, selectable,
customizable avatar system. Households get one of 24+ curated faces (or a
customized face) they can tap to change from anywhere in the app.

Guiding constraints:
- Purely client-side SVG rendering — zero runtime network calls (matches the
  existing local-first rule).
- License-safe: style must be free for personal and commercial use, with an
  in-app credit line.
- Deterministic rendering: same config always yields the same face.
- `prefers-reduced-motion` respected; keyboard-accessible picker with
  `:focus-visible` rings.
- Out of scope: the app mascot (`AnimatedMascot`) and theme `PixelSprite`s stay
  as they are — only the per-resident avatars (`PixelAvatar`) are replaced.

## 1. Style & rendering (approved)

- **Engine:** DiceBear `@dicebear/core` + the `avataaars` style definition
  (`@dicebear/styles/avataaars.json`). Creator: Pablo Stanley — license: *Free
  for personal and commercial use* (`https://avataaars.com/`). DiceBear core is
  MIT; we only bundle the one style's JSON (~170 KB).
- **Verified option set** (read directly from the definition file):
  - `top` — 34 variants: `hijab`, `turban`, `hat`, `winterHat1`–`winterHat04`,
    plus 29 hairstyles (shortRound, shortFlat, shortWaved, theCaesar, sides,
    bigHair, bob, bun, curly, curvy, frida, fro, froBand, longButNotTooLong,
    miaWallace, dreads, shavedSides, straight01/02, …).
  - `facialHair` — beardLight, beardMedium, beardMajestic, moustacheFancy,
    moustacheMagnum.
  - `accessories` — round, prescription01, prescription02, sunglasses,
    wayfarers, eyepatch, kurt.
  - `eyes` (12: happy, wink, squint, surprised, …), `mouth` (12: smile, serious,
    tongue, …), `eyebrows` (13), `nose`.
  - `clothes` — shirtCrewNeck, shirtScoopNeck, shirtVNeck, hoodie, blazer,
    overall, graphicShirt, collarAndSweater, blazerAndShirt, blazerAndSweater.
  - Color groups — `skin` (7 values: `#ffdbb4` light → `#edb98a`,
    `#d08b5b`, `#ae5d29` brown, `#614335` dark), `hair` (10), `hat` (15; also
    colors hijab/turban/hats), `clothes` (15), `accessories` (15),
    `facialHair` (10).
- **Rendering:** new `ResidentAvatar` component renders inline SVG via
  `new Avatar(style, options).toString()` with `borderRadius: 50`,
  `idRandomization: true`, and a `title` (a11y label). It is wrapped in the
  existing circular-ring container so it stays crisp at 24–64 px and keeps the
  status ring behavior (e.g. Dashboard's `ring={!paid}`).
- **Cleanup:** delete `PixelAvatar.tsx` and its helpers (`characterFor`, the 30
  character names, pixel grids). Remove now-unused avatar theme fields from
  theme definitions (see §4).
- **Credit:** footer in picker + a Settings line: "Avatars by Pablo Stanley —
  Avataaars (free for personal & commercial use)".

## 2. Data & persistence (approved)

- **New column:** `House.avatar` — nullable text on the backend (Alembic
  migration, one new file, same pattern as the reminder index migration).
- **Storage format:** a compact JSON object of DiceBear options, e.g.
  `{"top":"hijab","hat":"#262e33","skin":"#edb98a","eyes":"happy","mouth":"smile"}`.
  `null` = not customized. The `seed` is not stored — it is derived from the
  house identity at render time.
- **API:** `avatar` is included in `GET /state` house serialization and accepted
  on `POST /houses` and `PUT /houses/update`. Import/bulk leave it `null`.
- **Frontend:** `Household.avatar: string | null`; hydrated by the existing data
  store like the other house fields.
- **Backups:** the field rides on the House row inside `/state`, so existing
  export/backup flows carry it automatically.

## 3. Avatar picker (approved)

- **Entry point:** clicking any resident avatar anywhere (Dashboard, Records,
  Leaderboard, Reminders) opens the picker. Reuses the existing `Dialog`
  component (focus handling, Esc-to-close, backdrop, spring pop, reduced-motion
  gating already implemented).
- **Layout:**
  1. Live preview — large current selection + household name.
  2. Curated grid — 24+ ready faces, grouped for scanning: *Men* (short hair,
     buzz, cap, beard, elder w/ turban), *Women* (long hair, bun, braids,
     hijab), *Headwear* (hijab, turban/kufi, cap, hat, winter hat); light-skin
     and brown-skin variants spread across the groups. One tap selects.
  3. Customize — quick tweaks with live preview: skin tone (5 chips: light →
     brown → dark), headwear (hair / hijab / turban / cap / hat / winter hat),
     hair color, glasses on/off, beard on/off.
  4. 🎲 Random — picks a valid random face.
- **Actions:** Save (via `useHouseMutation` → `PUT /houses/update`), Cancel,
  and Reset-to-default (clears `avatar` back to `null`).
- **Neutral placeholder** (for `null`): muted theme-colored circle with the
  household's initial letter.
- **Accessibility/motion:** keyboard-focusable buttons with `:focus-visible`
  rings; no new motion besides the existing dialog spring.

## 4. Surface swap & cleanup (approved)

- Replace `PixelAvatar` → `ResidentAvatar` at all resident-avatar call sites:
  - `pages/RecordsPage.tsx` — lines ~780 (26px), ~791 (44px), ~1420 (64px),
    ~1583 (24px). All become clickable to open the picker.
  - `pages/LeaderboardPage.tsx` — lines ~121 (40px), ~124 (52px), ~264 (44px).
  - `pages/DashboardPage.tsx` — lines ~603 (34px), ~612 (56px, `ring={!paid}`).
- Settings page: update the theme-preview line ("Resident avatar · pixel") to a
  neutral-placeholder / face sample + hint "Tap any resident avatar to
  customize it". Add the avataaars credit line next to the Kenney credits.
- Remove avatar-only theme fields (`avatar.style`, `avatar.seedBase`,
  `avatar.background`, `avatar.ring`) from theme definitions and the
  `AvatarTheme` type once no code references them.

## Verification

- `cd apps/frontend && npx tsc -b` — 0 errors.
- `npx vite build` — clean build; bundled `@dicebear/core` + avataaars JSON.
- `npx oxlint` — no new warnings.
- Backend: migration applies; `POST /houses` and `PUT /houses/update` accept
  `avatar`; `GET /state` returns it; invalid JSON rejected (422).
- Manual: picker opens from every avatar surface, presets/customize/random/
  reset all persist after reload, placeholder shows for unset houses, hijab +
  turban + light/brown skin presets present, credit lines visible.
