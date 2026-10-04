// API contract types. Keep in sync with docs/api.md.

export type Freshness = 'green' | 'amber' | 'red'
export type TagAction = 'freed' | 'filled' | 'full' | 'arrive'
export type HoldStatus = 'active' | 'arrived' | 'expired' | 'cancelled'
export type EventSource = 'tap' | 'sms' | 'staff' | 'hold' | 'arrival' | 'expiry' | 'undo'
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
  /** false = staff turned off "accepting new people" tonight (no holds) */
  accepting: boolean
  /** what last changed the count */
  last_update_source: EventSource | null
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
  id: number
  time: string
  delta: number
  open_beds_after: number
  source: EventSource
  reverted: boolean
  /** set on a staff revert: the event it reversed */
  reverts_event_id: number | null
  /** tap/text/staff change from the last hour that hasn't been reverted */
  revertable: boolean
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

// --- Staff portal (needs X-Staff-Key) --------------------------------------------

export interface TagLink {
  action: TagAction
  label: string
  /** /t/<shelter>/<action>?k=<secret>, or null if the tag isn't set up yet */
  path: string | null
  /** TAG_BASE_URL + path: what gets written onto the NFC tag */
  url: string | null
  last_tap_at: string | null
  minutes_since_tap: number | null
}

export interface StaffDetail {
  shelter: Shelter
  holds: Hold[]
  events: AvailabilityEvent[]
  tags: TagLink[]
  revert_window_minutes: number
}

export interface StaffChange {
  status: 'applied' | 'reverted' | 'saved' | 'released'
  delta: number
  event_id: number
  open_beds: number
  shelter: Shelter
  reverted_event_id?: number
  hold?: Hold
}

export interface StaffSettings {
  pets_ok?: boolean
  accepting?: boolean
  staff_phone?: string
  capacity?: number
}

// --- Admin / test hub (needs X-Admin-Key, dev tools only) ------------------------

export interface AdminShelter extends Shelter {
  has_staff_key: boolean
  tags: TagLink[]
}

export interface VoiceLine {
  kind: 'greeting' | 'filler' | 'answer'
  text: string
  /** /audio/<id>.mp3, or null when Twilio's own voice (<Say>) would speak it */
  audio_url: string | null
}

export interface VoiceSimResult {
  request: Record<string, unknown>
  area: string | null
  matches: { id: string; name: string; open_beds: number; is_dv: boolean; score: number; distance_km: number | null }[]
  lines: VoiceLine[]
  voice: 'elevenlabs' | 'twilio_say'
  extractor: 'gemini' | 'keywords'
  timings_ms: { gemini: number; ranking: number; tts: number; total: number }
}

export interface SmsSimResult {
  reply: string
  changed: boolean
  delta: number | null
  shelter: Shelter | null
}
