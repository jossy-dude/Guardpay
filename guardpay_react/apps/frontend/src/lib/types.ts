// Core domain types for GuardPay v2

export interface Household {
  id: number
  name: string
  houseNumber: string
  fee: number
  notes: string
  active: boolean
  createdMonth: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  avatar: string | null
}

export type PaymentStatus = 'ontime' | 'unpaid' | 'upcoming' | 'partial'

export interface Payment {
  id: number
  houseId: number
  monthKey: string // "YYYY-MM"
  paidDate: string | null // ISO date
  amount: number
  note: string
  source: string // 'manual' | 'import' | 'partial'
  createdAt: string
  updatedAt: string
}

export interface GuardPayment {
  id: number
  monthKey: string
  paidDate: string
  amount: number
  method: 'transfer' | 'cash' | 'mobile'
  note: string
  createdAt: string
  updatedAt: string
}

export interface FeeChange {
  id: number
  houseId: number
  oldFee: number | null
  newFee: number
  changedAt: string
  note: string
}

export interface Reminder {
  id: number
  houseId: number
  houseName: string
  houseNumber: string
  isActive: boolean
  note: string
  createdAt: string
  remindedAt: string | null
}

export interface Alias {
  id: number
  houseId: number
  alias: string
  createdAt: string
}

export interface Settings {
  neighborhoodName: string
  currency: string
  dueDay: number
  guardName: string
  guardSalary: number
  backupBeforeChanges: boolean
  defaultFee: number
  guardAccountSuffix: string
  calendarMode: 'gregorian' | 'ethiopian'
  monthLanguage: 'english' | 'amharic'
  heatmapShape: 'square' | 'rounded'
}

// -------- Derived/calculated types (server or client computed) --------

export type MonthStatus = PaymentStatus

export interface MonthEntry {
  monthKey: string
  status: MonthStatus
  daysDiff: number // days late (negative = on time), null for unpaid
  paidDate: string | null
  amount: number | null
}

export interface HouseStats {
  history: MonthEntry[]
  resolved: MonthEntry[]
  currentStreak: number
  longestStreak: number
  onTimeRate: number // 0-100
  reliabilityScore: number // 0-100 new formula
  tier: 'excellent' | 'reliable' | 'inconsistent' | 'at_risk'
  paidMonths: number
  totalMonths: number
}

export interface DashboardStats {
  totalHouses: number
  paidCount: number
  unpaidCount: number
  totalCollected: number
  totalExpected: number
  completionPct: number
  onTimeCount: number
  currency: string
  month: string
  avgScore: number
}

// ----- Raw API responses (snake_case, as returned by FastAPI) -----

export interface ApiHousehold {
  id: number
  name: string
  house_number: string
  fee: number
  notes: string
  active: boolean
  created_month: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  avatar: string | null
}

export interface ApiPayment {
  id: number
  house_id: number
  month_key: string
  paid_date: string | null
  amount: number
  note: string
  source: string
  created_at: string
  updated_at: string
}

export interface ApiGuardPayment {
  id: number
  month_key: string
  paid_date: string
  amount: number
  method: string
  note: string
  created_at: string
  updated_at: string
}

export interface ApiReminder {
  id: number
  house_id: number
  is_active: boolean
  note: string
  created_at: string
  reminded_at: string | null
}

export interface ApiAlias {
  id: number
  house_id: number
  alias: string
  created_at: string
}

export interface ApiFeeChange {
  id: number
  house_id: number
  old_fee: number | null
  new_fee: number
  changed_at: string
  note: string
}

export interface ApiSettings {
  neighborhood_name: string
  currency: string
  due_day: number
  guard_name: string
  guard_salary: number
  backup_before_changes: boolean
  default_fee: number
  guard_account_suffix: string
  calendar_mode: 'gregorian' | 'ethiopian'
  month_language: 'english' | 'amharic'
  heatmap_shape: 'square' | 'rounded'
}

export interface ApiStateResponse {
  houses: ApiHousehold[]
  payments: ApiPayment[]
  guard_payments: ApiGuardPayment[]
  settings: ApiSettings
  reminders: ApiReminder[]
  aliases: ApiAlias[]
  fee_changes: ApiFeeChange[]
}

export type ThemeId =
  | 'sepia'
  | 'midnight-arcade'
  | 'blueprint'
  | 'botanical'
  | 'sunwashed'
  | 'terminal'
  | 'royal-ledger'
  | 'newspaper'
  | 'morning-edition'
  | 'evening-gazette'
  | 'broadsheet-blue'
  | 'tabloid-gold'
  | 'gazette-noir'

/** Structural family: "watch" themes use the brass-seal / patrol-seal & ink
 *  aesthetic with a seal ring and engraved type; "modern" themes keep the
 *  clean, rounded contemporary look. */
export type ThemeFamily = 'watch' | 'modern'

/** Card surface shapes applied globally via `data-shape` on <html> + `data-surface` on cards. */
export type ShapeId = 'rectangle' | 'square' | 'circle' | 'trapezoid' | 'parallelogram' | 'irregular'

/** Atomic sound presets that a theme can remap per action. */
export type SoundPreset = 'tick' | 'click' | 'type' | 'chime' | 'ding' | 'coin' | 'beep' | 'thock' | 'whoosh' | 'paid' | 'unpay' | 'error' | 'close'

/** Which preset to play for each semantic action within a theme. */
export interface SoundTheme {
  toggle: SoundPreset
  paid: SoundPreset
  unpay: SoundPreset
  error: SoundPreset
  hover: SoundPreset
}

/** A named, theme-specific pixel mascot (guard / detective / etc). */
export interface MascotTheme {
  key: string
  name: string
  role: string
  /** speech-bubble lines that rotate */
  lines: string[]
}

/** Which of the built-in pixel art sprites a theme uses for its mascot. */
export type MascotSpriteKey =
  | 'guard'
  | 'pixel'
  | 'detective'
  | 'bot'
  | 'builder'
  | 'grove'
  | 'scribe'
  | 'scout'
