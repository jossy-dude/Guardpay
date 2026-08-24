# GuardPay Master Design — Ledger Year View, Hardening, Drive Backup, UI Fixes, Sync + Expo

**Date:** 2026-08-24 · **Status:** Approved by owner · **Repo:** `guardpay_react/` (+ legacy `guardpay/` reference only)

---

## Decisions Log (owner-approved)

| Decision | Choice |
|---|---|
| Year view interaction | **Editable matrix** — tap cell toggles paid/unpaid instantly |
| Amharic scope | **Calendar surfaces always Amharic**; rest of app keeps language setting |
| Google Drive backup | **Auto-backup**: port stdlib module, upload daily snapshot when connected |
| Mobile strategy | **Dedicated Expo Android app** (no mobile web UI), syncs to PC over LAN |
| Sync model | **Option A** server-canonical store + phone offline outbox; **conflicts resolve phone-first** (owner uses phone ~99%) |
| Expo parity | **Full parity**, pixel-perfect theme replication where feasible; screens that don't translate get researched and rebuilt mobile-native **one by one** |
| Backend tests | **Yes** — pytest suite is part of "production-ready" |
| UI improvements | **Tier A (theme-correctness bugs) + Tier B (feel/polish)** now; Tier C a11y deep-dive folded into Expo pass |
| Execution order | 1 All-view → 2 Backend hardening → 3 Drive backup → 4 Stability+UI fixes → 5 Sync → 6 Expo |
| Change control | Owner approves design once; **ask before any change outside this spec**; demo checkpoint after each sub-project |

**Standing assumptions:** Android device floor = 7.0 (API 24, React Native minimum, ≈98% coverage). Drive OAuth requires one-time free Google Cloud client setup (walkthrough provided). Phone edits win conflict ties.

---

## 1. Yearly "All" View + Ethiopian Calendar Anchoring (web)

### Problem
RecordsPage month picker shows rolling 12 Gregorian months ending today; Ethiopian-labeled order straddles EC years. No cross-month view exists.

### Spec
- New `ViewId` `'year'` added to RecordsPage dataview tabs (`VIEWS`, persisted like others).
- Column axis: **13 months of selected Ethiopian year**, headers always Amharic (`ETHIOPIAN_MONTHS_AM`), መስከረም→ጳጉሜ.
- Mapping: EC year `Y`, month `m` → Gregorian month-key via `ethiopianToGregorian(Y, m, 15)` → `"YYYY-MM"` (existing helpers; math verified against anchor dates).
- **Year navigator** `‹ 2018 ዓ.ም ›`: default = current EC year (from `monthKeyToEthiopian(currentMonthKey())`); persisted in localStorage; Pagume column renders with leap-year awareness.
- Rows: active households (search/sort/filter pipeline reused). First column sticky (house # + name); header row sticky; horizontal scroll for 13 columns.
- Cell states: paid (✓ + paid-day number, themed success), unpaid/due (empty/danger ring), future-in-year (visible, disabled), before house creation (`—`, disabled).
- Interaction: tap toggles payment (optimistic, same mutation as month views, sound + press animation, pending guard per cell).
- Footer row: per-month collected vs expected ETB (tabular-nums).
- Month-picker fix: when `settings.calendarMode === 'ethiopian'`, picker lists the 13 months of current EC year in EC order instead of rolling Gregorian window; Gregorian mode unchanged.
- Web-mobile note: horizontal scroll works on touch; native version arrives with Expo app.

## 2. Backend Hardening + Test Suite

Fixes (files under `apps/backend/app/`):
1. **Restore safety** (`api/backups.py:_do_restore`): checkpoint WAL → dispose engine pool → `os.replace` → delete stale `-wal/-shm` → recreate engine → run migrations. Restore response reports truthfully.
2. **Startup snapshot** (`main.py` lifespan): replace bare `except: pass` with logged failure; take pre-migration snapshot before first-ever migration of a legacy DB.
3. **Legacy-DB guard** (`core/migrations.py`): refuse stamp/migrate when v1-only tables present (`sms_candidates`, `integrations`) — raise clear error.
4. **Rotation pools** (`services/backups.py`): autos keep 30; safety suffixes (`prerestore/preimport/preclear`) keep separate pool of 10.
5. **Snapshot verification**: `PRAGMA integrity_check` post-create; failed snapshots not rotated into place.
6. **Deletion journal**: new table `deleted_rows(table TEXT, row_pk TEXT, deleted_at TEXT, deleted_by TEXT)`; every hard delete writes a row in the same transaction (payments unpay at `api/houses.py:371`, alias deletes). Foundation for sync pull.
7. **`GET /api/health`**: unauthenticated `{ok, version, uptime}`.

Tests (`apps/backend/tests/`, pytest + pytest-asyncio + httpx ASGI transport, tmp DB fixtures):
- auth: PIN set/verify/disable, login throttle, session cookie flags, secret rotation on PIN change
- payments: toggle round-trip incl. IntegrityError race retry; unpay writes deletion-journal row atomically
- backups: create/list/download path-traversal; restore safety sequence asserts WAL cleanup; rotation pool isolation
- migrations: fresh DB stamps+upgrades; mid-chain upgrades; legacy-shaped DB refused
- settings whitelist; scoring golden fixtures shared verbatim with TS side
- Single command: `pytest`. No network access required.

## 3. Google Drive Auto-Backup

- Port `guardpay/src/gdrive.py` (203 lines, stdlib-only) → `apps/backend/app/services/gdrive.py`; blocking urllib wrapped in `asyncio.to_thread`; `asyncio.Lock` around token refresh.
- Token/client keys stored in `settings` table (`gdrive_client_id/secret/refresh_token/access_token/token_expiry/folder_id/last_backup_at`), **excluded from `GET /api/settings` responses**.
- New router `/api/integrations/gdrive/`: `POST save-client`, `POST connect`, `GET callback` (HTML result page; escape all interpolated values — fixes v1's reflected-HTML bug), `GET status`, `POST disconnect`, `POST backup-now`.
- **Auto mode**: after daily auto-snapshot, background task uploads if connected; setting `gdrive_auto_enabled` default ON; Drive folder keeps last 30; failures logged, never fatal.
- Frontend: replace Settings placeholder card ("Export bridge… Coming soon") with status/connect/disconnect/backup-now/auto-toggle/last-upload display.

## 4. Stability Must-Fixes + UI Tier A/B (web)

### Stability (all applied)
1. Root `<ErrorBoundary>` in `main.tsx` (ledger-styled fallback, reload button).
2. Optimistic rollback: snapshot previous payments in `onMutate`; restore on error instead of relying on refetch (`lib/hooks.ts` toggle path).
3. `resolveTheme()` fallback `?? THEMES.sepia` + persist merge validation (`themes.ts:577`).
4. Defensive array/object guards in `dataStore.setState` hydration.
5. Per-cell pending guards on Dashboard toggles (mirror RecordsPage pattern).
6. Named blur handlers removed correctly (ContextMenu.tsx:46/50, Popover.tsx:68/72).
7. Date basis unification: `todayIso()` local-time; `paidDate` parsed consistently (`T00:00:00`) in scoring.
8. Cleanup: remove `@rive-app/react-canvas`, fix/delete placeholder `pnpm-workspace.yaml`, delete unused `public/icons.svg` + `public/fonts/*`, restore default chunk warning limit while splitting framer-motion into manualChunks.

### UI Tier A (theme correctness)
- Replace hardcoded `TAG_PALETTE`/`TierPill` (RecordsPage:96–114, 775, 1499) with theme-var tints via `color-mix`; single tier badge component.
- ThemeEngine computes `--success-fg/--danger-fg/--accent-fg` by luminance; replace bare `text-white` on colored fills (button.tsx, Header bell, Leaderboard crown).
- **Append `'Noto Sans Ethiopic'` to body/display font stacks** (ThemeEngine.tsx:64–66) — prerequisite for All-view quality.
- Mascot blink: real pulse (~140ms closed); gaze rect cached on enter/resize, updates rAF-batched.
- Dialog: remove self-`aria-hidden`, add focus trap + scrollbar-compensated scroll lock.
- Popover/ContextMenu panels get `data-surface` + radius vars; viewport-clamped positioning.
- Leaderboard delete→edit mis-wire fixed (LeaderboardPage:157); recharts tooltip text color themed.

### UI Tier B (polish)
- `AnimatePresence` route transitions; ledger-styled loading skeletons replace "Loading…" text.
- One pending-spinner language; QuickEntry feedback animated + `aria-live`; toast hover-pauses timer.
- Confetti + sound parity when final board cell settles in Records views.
- Mascot loops pause offscreen (IntersectionObserver); cap simultaneous instances on Settings theme grid.
- `tabular-nums` on money/stat columns; add missing font weights (Fraunces 600/700, Inter 700, Space Grotesk 500, JBMono 600); lazy-load font CSS per active theme; complete `motion-reduce:` coverage on scale/pulse effects.

## 5. Sync System (detailed)

### Model
Server keeps canonical SQLite (web + Drive depend on it). Phone runs offline-first copy; pushes queued changes, pulls deltas. **Conflict policy: LWW with phone-priority tiebreak** (default; configurable server-priority / newest-wins).

### Pairing & auth
- Server Settings page shows QR: `{server_name, base_url, one_time_code}` (code expires 10 min, single use).
- Phone claims code → registers device (new `devices` table: id, name, paired_at, token_hash, last_seen, revoked) → receives long-lived device token (HMAC, stored in SecureStore). Manual IP entry fallback; mDNS auto-discovery deferred.
- All `/api/sync/*` require device token; rate-limited; revocable from web Settings.

### Wire protocol
- `POST /api/sync/push` `{device_id, changes:[{idempotency_key, entity, op, payload, client_ts}]}` → applies through existing service layer (stats/scoring consistent), dedupes by key (dedupe table), returns per-item results + new pull cursor.
- `GET /api/sync/pull?cursor=N` → rows with watermark > N across houses/payments/guard_payments/reminders/aliases/settings/fee_changes + deletion-journal entries; monotonic counter table `sync_watermark` bumped inside every write transaction.
- Deletes travel via `deleted_rows` journal (§2.6).

### Phone-local schema
Mirror tables + `outbox(id, idempotency_key UNIQUE, entity, op, payload, created_at, attempts, last_error)` + `sync_meta(cursor_pull, device_id, server_url, last_sync_at)` + local tombstones for pending deletes.

### Engine triggers
App foreground · Wi-Fi reconnect (NetInfo) · manual Sync now · optional foreground interval. Exponential backoff; never blocks UI (reads always local).

### Sync Center screen (defaults bold)
Connection card (server name/reachable/IP) · last-sync · pending count · Sync now · auto-sync **ON** · interval **15 min foreground-only** · Wi-Fi-only **ON** · conflict policy **phone-priority** · backup-phone-DB-before-push **ON** · paired-devices mgmt · sync history log (last 50 events).

## 6. Expo Android App

- `guardpay_react/apps/mobile` — Expo SDK 55+, expo-router bottom tabs: Home · Ledger · Residents · More. TypeScript strict. Extracts `packages/shared` (types, calendar.ts, scoring.ts, sound-map types) consumed by BOTH web and mobile — ends duplication drift (incl. TS↔Python scoring divergence test from §2).
- Builds: EAS cloud (free tier 30/mo), profiles dev/preview(APK)/production; keystore managed by EAS. No local Android SDK ever.
- Theming: port `themes.ts` verbatim into native ThemeEngine (context + nativewind CSS-var bridge); identical fonts incl. **Noto Sans Ethiopic**; color ramps/radii/shapes preserved.
- Screen-by-screen method: research desktop element's intent → rebuild native where needed. Dashboard→swipeable stat cards; Ledger matrix→sticky-column horizontal ScrollView + expo-haptics; Analytics→victory-native-xl; Exports→expo-print + share; LockScreen→biometric (expo-local-authentication) w/ PIN fallback; sounds→expo-audio (same .ogg).
- Milestones (demo checkpoint each): **M1** data core + sync end-to-end (lock/dashboard/ledger/residents/edit) · **M2** analytics, exports, reminders, settings/sync-center full · **M3** all 13 themes, mascot port (reanimated), sound polish.

---

*End of spec.*
