// API contract types. Keep in sync with docs/api.md.

export type Freshness = 'green' | 'amber' | 'red'
export type TagAction = 'freed' | 'filled' | 'full' | 'arrive'
export type HoldStatus = 'active' | 'arrived' | 'expired' | 'cancelled'
export type EventSource = 'tap' | 'sms' | 'hold' | 'arrival' | 'expiry' | 'undo'
export type FilterKey = 'women_only' | 'youth' | 'families' | 'pets_ok' | 'accessible' | 'couples'

export interface Shelter {
  id: string
  name: string
  address: string | null // null for DV shelters
  lat: number | null // null for DV shelters
  lng: number | null
  capacity: number
  open_beds: number
  is_full: boolean
  women_only: boolean
  youth: boolean
  families: boolean
  pets_ok: boolean
  accessible: boolean
  couples: boolean
  is_dv: boolean
  dv_phone: string | null
  staff_phone: string | null
  last_updated_at: string
  minutes_since_update: number
  freshness: Freshness
}

export interface Hold {
  id: string
  shelter_id: string
  worker_name: string
  worker_org: string
  created_at: string
  expires_at: string
  status: HoldStatus
  minutes_left: number
}

export interface AvailabilityEvent {
  time: string
  delta: number
  open_beds_after: number
  source: EventSource
}

export interface TapResponse {
  status: 'applied' | 'duplicate' | 'ignored_cooldown' | 'arrived' | 'choose_hold' | 'no_active_holds'
  action: TagAction
  tap_id: string
  open_beds: number
  shelter: Shelter
  delta?: number
  undo_seconds?: number
  hold?: Hold
  holds?: Hold[]
}

export interface UndoResponse {
  status: 'undone' | 'nothing_to_undo'
  tap_id: string
  delta?: number
  open_beds?: number
  shelter?: Shelter
}

export interface HoldWithShelter {
  hold: Hold
  shelter: Shelter
}

export interface VoiceCriteria {
  gender: string | null
  age_group: string | null
  family: boolean | null
  has_pet: boolean | null
  needs_accessible: boolean | null
  is_couple: boolean | null
  area_text: string | null
  language: string
}

export interface VoiceMatchItem {
  shelter: Shelter
  score: number
  distance_km: number | null
  walk_minutes: number | null
  reasoning_trace: string[]
  reasoning_text: string
}

export interface VoiceMatchResponse {
  ok: boolean
  criteria: VoiceCriteria
  area_name: string | null
  narration: string
  spoken_answer: string
  matches: VoiceMatchItem[]
}

export interface SpeakResponse {
  ok: boolean
  audio_url?: string
  fallback_tts?: boolean
  text?: string
}

