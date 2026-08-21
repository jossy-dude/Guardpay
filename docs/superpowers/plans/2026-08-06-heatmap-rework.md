# Heatmap Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the Payment Calendar heatmap: fix day/month labels, add month boundaries, smart-scroll to current day, square cells with settings toggle, themed scrollbar.

**Architecture:** Changes are confined to `DashboardPage.tsx` (PaymentHeatmap + buildHeatCells), `types.ts` (Settings), `dataStore.ts` (defaults/mapping), and `SettingsPage.tsx` (toggle). No backend changes needed for the shape toggle — store it client-side in Settings like other visual prefs.

**Tech Stack:** React 19, Vite 8, TypeScript 6 (strict), Tailwind CSS, Zustand. No new dependencies.

## Global Constraints
- TS strict, `verbatimModuleSyntax` (type-only imports), `noUnusedLocals`, `noUncheckedIndexedAccess`
- No unit-test runner; verify with `npx tsc -b` + `npx vite build`
- Real DB rows must never be mutated
- All theme colors accessed via `resolveTheme()` → `theme.colors`

---

### Task 1: Fix day labels and month label duplication

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx:139-203` (buildHeatCells), `:239-256` (day label grid)

**What changes:**
1. Day labels: show all 7 days (S, M, T, W, T, F, S) mapped to rows 1-7 instead of only M/W/F at rows 2/4/6.
2. Month labels: track by month key (`YYYY-MM`) instead of column number to prevent duplicates. Label each month only once at its first column.
3. Month label positioning: use the first column of each month for label placement.

**Interface changes:**
- `buildHeatCells` return type: `months: { col: number; label: string; monthKey: string }[]` (add `monthKey` for Task 3 hover).

---

### Task 2: Month boundary visualization (hover highlight)

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx:205-306` (PaymentHeatmap)

**What changes:**
1. Track hovered month via `useState<string | null>` (monthKey or null).
2. Month label `<span>` gets `onMouseEnter={() => setHoveredMonth(m.monthKey)}` and `onMouseLeave={() => setHoveredMonth(null)}`.
3. Each heatmap cell checks if it belongs to the hovered month: if `hoveredMonth` is set and cell's month differs → apply `opacity: 0.25` (blur/fade effect). If same month → full opacity + subtle background highlight.
4. Add thin vertical separator lines between months (1px `var(--border)` lines at month boundaries) inside the grid.

---

### Task 3: Smart-scroll to current day

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx:239-294` (scroll container)

**What changes:**
1. Add `ref` to the `overflow-x-auto` div.
2. `useEffect` on mount: find the cell with `c.today === true`, compute its x-position (`col * pitch`), scroll the container so the current day sits at ~70% of the viewport width (not at the far right corner).
3. Use `scrollIntoView({ inline: 'center', block: 'nearest' })` on the today cell, or compute `scrollLeft = todayCol * pitch - containerWidth * 0.3`.

---

### Task 4: Square cells + settings toggle

**Files:**
- Modify: `guardpay_react/apps/frontend/src/lib/types.ts:69-80` (Settings interface)
- Modify: `guardpay_react/apps/frontend/src/features/payments/dataStore.ts:34-60` (emptySettings + mapSettings)
- Modify: `guardpay_react/apps/frontend/src/pages/SettingsPage.tsx` (add toggle)
- Modify: `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx:282` (cell rendering)

**What changes:**
1. Add `heatmapShape: 'square' | 'circle'` to `Settings` interface.
2. Default: `'square'` in `emptySettings`, map from `a.heatmap_shape ?? 'square'` in `mapSettings`.
3. SettingsPage: add a toggle (segmented control or radio) under the appearance section: "Calendar cells: Square / Circle".
4. PaymentHeatmap reads `useDataStore(s => s.settings.heatmapShape)` and applies `rounded-sm` (square) or `rounded-full` (circle) to each cell.

---

### Task 5: Themed scrollbar

**Files:**
- Modify: `guardpay_react/apps/frontend/src/pages/DashboardPage.tsx:239` (overflow container)
- Modify: `guardpay_react/apps/frontend/src/index.css` (scrollbar styles)

**What changes:**
1. Add a CSS class `.heatmap-scroll` with custom scrollbar styling: `::-webkit-scrollbar` height 4px (was ~16px), `::-webkit-scrollbar-thumb` rounded, colored with `var(--border-strong)` or `var(--muted)`.
2. Apply `className="heatmap-scroll"` to the overflow container.
3. For Firefox: `scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent;`.

---

### Task 6: Verification

**Files:** None (verification only)

**Steps:**
1. `npx tsc -b` → 0 errors
2. `npx vite build` → success
3. Start dev server, take headless screenshot at 1280px width
4. Verify: all 7 day labels visible, no duplicate month labels, month separators visible, current day visible without scrolling to far right, cells are square, scrollbar is thin and themed
