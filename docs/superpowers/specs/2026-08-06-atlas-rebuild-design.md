# Atlas Rebuild — Design Spec

> **Status:** Approved in sections by user (2026-08-06), with tweaks incorporated.
> **Scope:** 7 workstreams across the GuardPay frontend + minimal backend settings. This is the design; implementation is tracked in a companion plan with multi-agent execution.

**Goal:** A cohesive UI rebuild: a living heatmap, a glassy edition-gallery theme picker, tactile override controls, balanced status-change animation + sounds, a `late`-free ledger, and a global card-shape system.

**Architecture:** All workstreams live in `guardpay_react/apps/frontend` except WS1 (backend settings key) and WS6 (backend scoring). Frontend is React 19 + Vite 8 + TS strict + Tailwind v4 + framer-motion + zustand. Backend is FastAPI + SQLAlchemy.

---

## WS1 — Heatmap rework

**File:** `src/pages/DashboardPage.tsx` (PaymentHeatmap + buildHeatCells), `src/index.css`, backend settings.

### Data model changes (`buildHeatCells`)
- `HeatCell` gains `monthKey: string` (YYYY-MM).
- `HeatMonth` = `{ col: number; label: string; monthKey: string }` — **one label per month**, positioned at the column of the month's first day. Fixes "Aug Aug" duplication caused by the current `date.getDate() <= 7` per-column labeling.
- Grid range: render through the **end of the current week** (Saturday) so the final column is complete (cells after today have `count: 0` → base color, no `today` flag).

### Day labels
- Show all **7 day letters** `S M T W T F S` in the left rail.
- Fix vertical misalignment: label rail `marginTop` changes **28px → 20px** (matches the 16px month-label row + 4px mb-1), so letters center exactly on their cell rows.

### Month boundaries + hover
- Render a thin `var(--border)` vertical separator line at the start column of each month (skip the first).
- **Hover** a month label → that month's cells stay full color; all other cells fade to `opacity: 0.22` (smooth `transition-opacity`). `onFocus`/`onBlur` mirror it for keyboard.

### Current-day scroll ("smart" 85%)
- On mount, auto-scroll the container so **today's column sits at ~85%** of the container width:
  `scrollLeft = clamp(todayColX − 0.85 · clientWidth, 0, maxScroll)`.
- Add a small floating **"Today" chip** that appears when the user has scrolled away from today; clicking smooth-scrolls today back to the 85% position.
- Today's cell keeps the accent ring; give it a subtle glow shadow too.

### Square heatmap cells — "3D while 2D"
- Cells are **square** by default; very round corners (`border-radius: ~35%`), layered so they pop:
  - stacked `box-shadow`: a soft drop shadow (`0 2px 6px rgba(0,0,0,0.18)`) + a subtle 1px inner highlight (`inset 0 1px 0 rgba(255,255,255,0.25)`) so each tile reads as a raised 2D tile.
  - today's tile gets the accent ring + a matching glow.
- **Settings toggle** (General tab, Calendar section): `heatmap_shape: 'square' | 'rounded'`.
  - `square` = the new layered square tiles (default).
  - `rounded` = current behavior (small rounding, flat).
- Persisted end-to-end:
  - Backend `config.py` `DEFAULT_SETTINGS` add `"heatmap_shape": "square"`; `schemas` `SettingsUpdate` add `heatmap_shape: Literal["square","rounded"] | None`; `api/settings.py` GET returns it.
  - Frontend `types.ts` `Settings` + `ApiSettings` add `heatmap_shape`; `dataStore.ts` `emptySettings` + `mapSettings`; `SettingsPage` General tab adds a `ToggleRow` ("Square calendar tiles"); save payload adds `heatmap_shape`.

### Scrollbar — "dots / fancy, centered"
- Native scrollbar hidden on the heatmap container (`scrollbar-width: none`, `::-webkit-scrollbar { display:none }`).
- New **centered mini-scroller** rendered under the heatmap, **~6–7 tile-widths long**, themed:
  - a row of small rounded dots; a subset (thumb) is highlighted in `var(--border-strong)`; the rest `var(--border)`.
  - drag the highlighted thumb (framer-motion `drag="x"` with constraints) → maps to `scrollLeft`.
  - click a dot → smooth-scroll to that position.
  - updates live from the container's `scroll` event.

---

## WS2 — Theme/Appearance page redesign ("Edition gallery")

**File:** `src/pages/SettingsPage.tsx` (AppearanceTab), `src/features/theming/*`, `src/lib/router.tsx`.

### Theme cards — glass tiles holding the color
- Each card is a **glass tile**: `backdrop-blur`, translucent `colors.card` at low opacity, 1px light border, inner highlight — but **the theme's color must remain the hero**, so the glass is a tint, not a cover.
- Full-bleed gradient wash from `colors.primary → accent → card` at ~35% opacity so the palette is immediately visible.
- **Simple title** (`t.label`) + the theme's **prebuilt animated mascot SVG**, assigned per theme: `<AnimatedMascot sprite={t.sprite} />` (`t.sprite: MascotSpriteKey` already exists on `ThemeDefinition`), rendered **very small (~24–28px)** in the corner (bottom-right) so it never hides the color.
- **Minimal text:** name + `meta.tagline` only at rest. Description, family, font, texture chips appear **only on hover/selected** (expand-on-hover).
- Active card: check badge (existing behavior) + stronger ring.

### Hover preview (included)
- On hover, a compact **mini-dashboard mockup** fades in (absolute overlay or below): completion band (`colors.primary`), a 3×7 heatmap dot grid (`colors.heat`), a small `AnimatedMascot`, and stat chips in `colors.success`/`colors.danger`. Purely decorative.

### Sound on hover/select
- On hover, the theme's sounds play **slowly one after another** (hover preset → then `toggle` → then `paid`, each ~350ms apart) while the pointer stays; stops on leave.
- Click plays the theme `toggle` preset and applies.

### Header palette icon → deep-link to Appearance
- **Palette icon in `Header.tsx` navigates directly to the Appearance/theme tab** (its original function). Gear keeps going to General.
- Custom `HashRouter` gains `?tab=` parsing; `/settings?tab=appearance` opens `SettingsPage` on the Appearance tab; `SettingsPage` reads the query on mount and when the hash changes.

---

## WS3 — Override controls: unique widgets (no generic scrollbars)

Each override gets its own fitting, built-for-purpose control. All keep the existing "toggle-off = theme default" semantics.

| Control | New widget | Details |
|---|---|---|
| **Typography** | **Specimen cards** | A grid of small cards; each shows a large sample glyph pair (`Ag`) rendered in that font pairing + the font name. Select on click; card re-renders in its own font so you literally see it. |
| **Density** | **Mini-layout previews** | Three tiny stacked-line glyphs showing compact/comfortable/spacious spacing side by side (rows with different padding/gaps). Pick the layout, not a label. |
| **Corner radius / shapes** (WS7) | **Shape glyph buttons** | Each option shows its actual silhouette (rounded square for radius values; the real clip-path shape for WS7 shapes). |
| **Accent** (if surfaced) | **Swatch row** | A row of color dots incl. theme default; click to set `accentOverride`. |
| **Texture** (if surfaced) | **Texture swatches** | Small tiles each rendered with the actual `background-image` pattern. |

All live in a **scroll-snap strip** (horizontal) with spring/resistance drag feel on the container itself, and the selection snaps to center. Keyboard arrows move focus.

---

## WS4 — Sound: `unpay` slot + balanced timing

**File:** `src/hooks/useSound.ts`, `src/lib/types.ts`, `src/features/theming/themes.ts`, toggle call sites.

### New semantic slot
- `SoundTheme` gains **`unpay: SoundPreset`**; `play()` accepts `'unpay'`.
- Default preset: **gentle descending chime** (two soft sine notes, e.g. 700→500 Hz, short decay, low gain) — calm, not alarming. Add a `FILE_BANK` ogg + `PRESETS` synth fallback with a tuned envelope (fast ~8ms attack, ~250ms decay, gain ~0.08).
- Every theme defines its own `unpay` (flavor to theme character: arcade → descending coin-ish, newspaper → soft thock).

### Unify toggle sounds
- **paid → unpaid: always `play('unpay')`** on both Dashboard and Records (removes the dashboard buzz + the records keypress mismatch).
- **unpaid → paid: always `play('paid')`.**

### Balanced timing (call-site, WS5-adjacent)
- Only the pill/button animates (see WS5); the sound fires **on `onSuccess`** (not optimistic) so the audio lands exactly when the state flips. Keep a `pendingToggles` guard (already exists on Records) so double-clicks don't stack sounds.

---

## WS5 — Smooth status-change animation (no page shake)

**File:** `src/pages/DashboardPage.tsx` (HouseholdLedger), `src/pages/RecordsPage.tsx` (Board), `StatusStamp.tsx`.

### Root cause
- The dashboard's `motion.tr` uses `layout` + `AnimatePresence`, so any state change animates/relayouts the whole row (and toggling shifts rows → whole page jump).

### Fix
- Remove `layout` from the `motion.tr` row; rows render statically.
- **Animate only the changing element** (the status pill / toggle button): a `motion.span` on the pill with scale/fade/rotate on state change; the button press keeps its existing `whileTap`.
- **Fixed-size status cell** so the field doesn't resize neighbors when the label changes width (Paid vs Due): the pill container has a stable `min-width` and the label animates on a shared `LayoutGroup` with `layoutId` — the card accommodates both label sizes without moving anything else.
- Board view (Records): the dnd card status chip animates the same way; card size is stable.
- `StatusStamp` gains a `motion` wrapper for enter/exit (fade+slide 150ms) so swapping statuses reads as one smooth transition, not a layout jump.

### Dashboard "This month" field → "Due" card
- The polished **Late/Due card visual is retained and restyled as the Due state**: relabel to **Due**, color = `upcoming` (muted blue), used when the month is current + unpaid. Applies to the **dashboard register column only** (per user). Paid/Partial/Unpaid pills unchanged.

---

## WS6 — Ledger status rework (remove `late`)

**Files:** frontend scoring/status consumers + backend `services/scoring.py`.

### New status model
- `PaymentStatus = 'ontime' | 'partial' | 'unpaid' | 'upcoming'` — **`late` removed** (stays as `Partial` pill, `upcoming` = "Due", `ontime` = "Paid").
- Display labels: `ontime → Paid`, `partial → Partial`, `unpaid → Unpaid`, `upcoming → Due`.

### Scoring
- Backend `scoring.py:38` and frontend `scoring.ts:58`: paid → `ontime` regardless of `days_diff` (keep `days_diff` field for the record, but no `late` status).
- Frontend `DashboardStats`: remove `lateCount`.

### Consumers to update (delete `late` everywhere)
- `src/lib/types.ts` — union, `DashboardStats.lateCount`.
- `src/components/shared/StatusStamp.tsx` — `STAMP_META` remove `late`.
- `src/pages/RecordsPage.tsx` — `STATUS_RANK`, `TAG_PALETTE`, `TAG_LABEL`, `paid()` → `s === 'ontime'`, filter status list, `BucketKey`, `BOARD_BUCKETS` (3 columns: Paid/Unpaid/Due), `bucketFor`, board drag `targetPaid`/`currentlyPaid`, board card `isPaid`, order initializers.
- `src/pages/DataPage.tsx` — paid filters/totals (`s === 'ontime'`).
- `src/pages/ResidentPage.tsx` — `STATUS_LABEL` remove `late`.
- `src/features/exports/reports.tsx` — status union + all `s === 'ontime' || s === 'late'` → `s === 'ontime'`.
- `src/features/exports/exports.ts` — no `late` already; verify.
- `src/pages/AnalyticsExportsPage.tsx` — on-time series logic.
- Backend `app/services/scoring.py:38` + any response consumers.

### Kanban board (Records "Board" view)
- **Columns become: Paid / Unpaid / Due** (3 columns; `late` deleted). Partial stays a badge: partial records appear in the **Paid** column carrying their Partial pill.
- `bucketFor`: `ontime | partial → paid`, `unpaid → unpaid`, `upcoming → due`.
- Drag: dropping on Paid toggles **paid**; dropping on Unpaid/Due toggles **unpaid**.

---

## WS7 — Card shape system (global, replaces radius)

**Files:** `src/features/theming/themes.ts`, `src/features/theming/ThemeEngine.tsx`, `src/index.css`, surface components (`card.tsx`, `Layout.tsx` Section, `Dialog.tsx`, `HoverCard.tsx`, `Toast.tsx`, `LockScreen.tsx`).

### Shape model
- `ShapeId = 'rectangle' | 'square' | 'circle' | 'trapezoid' | 'parallelogram' | 'irregular'`.
- `ThemeDefinition.shape?: ShapeId` (per-theme default, e.g. watch themes → rectangle, botanical → square).
- `ThemeState` gains `shapeOverride: ShapeId | null` + `setShapeOverride` + included in `resetOverrides`.
- `resolveTheme` merges `shape`.
- `ThemeEngine` sets `root.setAttribute('data-shape', ...)` (mirrors `data-texture`).
- Replace the Settings "Corner radius" pills with the **shape glyph picker** (WS3).

### Application
- Add a shared `data-surface` attribute to Card, Section, Dialog, HoverCard, Toast, LockScreen (the major card surfaces).
- `index.css` rules on `[data-shape=...] [data-surface]`:
  - `rectangle` → `border-radius: 0` (sharp).
  - `square` → `border-radius: 8px` (small, crisp).
  - `circle` → `border-radius: 9999px`; surfaces that must stay rectangular (tables) opt out via a `data-surface="keep-rect"` escape hatch.
  - `trapezoid` → `clip-path: polygon(6% 0, 94% 0, 100% 100%, 0 100%)`; corners clipped, no radius.
  - `parallelogram` → `clip-path: polygon(8% 0, 100% 0, 92% 100%, 0 100%)`.
  - `irregular` → `clip-path: polygon(...)` with 4–5 varied vertices (a stable, designed blob, not random per render) + shadow.
- Per-shape tweaks: clip-path values, hover-lift shadow adjustments, and a small note where a shape looks bad (e.g. circle + long lists → the escape hatch).

### Compatibility
- The `--radius-md/lg/xl → var(--radius)` Tailwind mapping stays (used by buttons/inputs/pills which are NOT `data-surface` — they keep radius). Only big surfaces take shapes.

---

## Global constraints
- TS strict, `verbatimModuleSyntax`, `noUnusedLocals`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly` (no enums — use string unions).
- No unit-test runner; verification = `npx tsc -b` + `npx vite build` + live headless-Chrome/CDP checks (the harness used for prior work).
- Real DB rows never mutated; test settings round-trips use throwaway values restored after.
- Backend server on `:8420`, dev server proxy `/api → :8420`.
- Colors always via `resolveTheme()` → `theme.colors`; no hardcoded hex except the status palettes that already exist.
- Preserve existing interaction conventions (toggle-off = theme default, sounds via `useSound`).
