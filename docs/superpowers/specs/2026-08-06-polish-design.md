# GuardPay Polish Build — Design Spec

Date: 2026-08-06 · Status: approved (brainstorming skill, all sections)

## Scope

One coherent pass across three axes, per user approval:

1. **Audio engine** (Section 1, previously approved) — hybrid real-file + synth.
2. **Visual fit & finish** (Section 2, revised) — spring physics, stamp-style status badges, state-change choreography.
3. **Mascot redesign + "mascot AI"** (Section 3) — part-based SVG + deterministic behavioral engine.
4. **Backend ↔ frontend union** (Section 4) — cohesion audit fixes.

Guiding constraints:
- Local-first audio: every sound bundled into `apps/frontend/public/sounds/`, zero runtime web calls.
- CC0 + CC-BY only, with in-app credits (Settings → Sounds & Credits).
- Research-informed sound design (timing/longevity), 2024–2026 SVG design sources for the mascot.
- `prefers-reduced-motion` respected throughout.
- Keyboard-only `:focus-visible` rings retained (never on mouse click).

## 1. Audio engine (approved)

- Hybrid engine: curated real files (Kenney UI Audio CC0 — verified direct zip) + Web Audio synth fallback.
- Shared `AudioContext` + master gain bus; volume + mute persisted (`guardpay-sound` v2).
- Per-theme flavor: same files, per-theme pitch/envelope tweaks via `SoundTheme`.
- Settings: new "Sounds & Credits" entry with master volume, mute, sound-effect previews, and credits list.

### Sound research summary (applied)
- Percussive exponential-decay envelopes most likeable; flat tones annoying.
- Attack: 0.5–5 ms clicks, 5–20 ms confirmations. Decay: 30–150 ms micro, 150–400 ms whooshes.
- Vary pitch/timing to avoid habituation; throttle to avoid density fatigue.

### Assets
- Kenney UI Audio zip: `https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip` (`.ogg`: click1-5, rollover1-6, switch1-38, mouseclick1, mouserelease1). WAV mirror `https://lpc.opengameart.org/sites/default/files/UI_SFX_Set.zip`.
- Kenney interface-sounds zip (bong/pluck/tick/confirmation/error/glass/scroll/select/toggle).
- Kenney casino-audio zip (chip-lay/chips-collide).

## 2. Visual fit & finish (revised)

### Physics
- Spring-based (framer-motion springs), not linear transitions:
  - Press → `scale 0.97`, shadow compress, ~120 ms; release → spring settle with slight overshoot (`stiffness 400, damping 30`).
  - Hover → `y: -1px`, shadow lift, ~8% bg shift.
  - Reduced-motion → instant.

### Status badge redesign — "stamp/box"
- Paid/Unpaid rendered as a small rounded-square box, slightly tilted (~-7°), like a stamped label.
- Paid: solid success fill, white check, subtle inner top-glow.
- Unpaid: transparent, 2 px dashed amber/rose border (open/owing feel), counter-rotated check ghost.
- Slight alternating tilt per row for a handmade ledger feel.

### State-change choreography
- Stamp-in settle: scale 0.6 → 1.05 → 1 with rotation settle (~200 ms) on status flip.
- Color sweep: diagonal gradient sweep (theme-color pulse) across badge/card at change moment.
- Check draw-on: SVG checkmark path `stroke-dashoffset` animates in on "paid".
- Card micro spring y-bounce + tint pulse; paired with the click sound.
- Milestone (whole month settled) → tasteful confetti burst in theme colors.
- Staggered spring card entrance; magnetic hover on primary buttons.

## 3. Mascot redesign + "mascot AI"

### Visual
- Clean part-based SVG (head/eyes/mouth/arms/body as named layers), DiceBear v10 JSON-declared style architecture as reference; Open Peeps CC0 hand-drawn warmth as style base (redrawn/adapted, credited).
- Single cohesive character per theme replacing fragmented sprite keys (keep `MascotSpriteKey` for selection).

### Behavioral engine (deterministic, no network)
- Mood model (valence × energy) + event queue + short-term memory.
- Weighted reactions: payment settled (happy), streak (excited), long idle (tired/boredom → attention-seeking), busy (focused).
- Per-state frame sets + micro-randomization (jitter, blink, breathing).
- Lip-sync-lite: speech lines drive a syllable timer → jaw-scale pulses.
- Idle micro-loops; respects `prefers-reduced-motion`.

## 4. Backend ↔ frontend union (cohesion audit)

Fix six contract mismatches + perf:
1. `Payment.source` dropped in dataStore mapping → restore field (`lib/types.ts` + `dataStore.ts` + toggle optimistic).
2. `guard_account_suffix` 3-way drift → single source of truth; kill dead `"3325"` default in `config.py`.
3. `public_lookup.monthly_status` hardcoded placeholder → derive from real state or drop the field.
4. Backend `calendar_mode`/`month_language` unvalidated str → validate against frontend union.
5. Toggle optimistic `amount ?? 0` flash → use server fee fallback (don't optimistic-write a bogus 0).
6. Reminder dedupe race → unique constraint / transactional guard.
7. `/import` N+1 loop → single query for existing payments per house batch.

## Verification

- After each step: `npx tsc -b && npx vite build && npx oxlint` in frontend; backend boot + `/api/health`.
- Final: restart server on `:8420`, verify `/api/state` intact (4 houses / 8 payments / 1 guard), pin open.
