import type {
  AdminShelter,
  HoldWithShelter,
  Shelter,
  SmsSimResult,
  SpeakResponse,
  StaffChange,
  StaffDetail,
  StaffSettings,
  TagAction,
  TagLink,
  TapResponse,
  UndoResponse,
  VoiceMatchResponse,
  VoiceSimResult,
} from './types'
import type { Worker } from './worker'

export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_BASE + path, init)
  } catch {
    throw new ApiError(0, 'network_error')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `http_${res.status}`)
  return body as T
}

function send<T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown, headers: HeadersInit = {}): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
}

/** Staff portal auth: the shelter's own key, or the admin key (dev tools only). */
export type StaffAuth = { staffKey: string } | { adminKey: string }

function staffHeaders(auth: StaffAuth): HeadersInit {
  return 'staffKey' in auth ? { 'X-Staff-Key': auth.staffKey } : { 'X-Admin-Key': auth.adminKey }
}

const enc = encodeURIComponent

export const api = {
  shelters: () => request<{ shelters: Shelter[] }>('/api/shelters').then((r) => r.shelters),
  shelter: (id: string) => request<{ shelter: Shelter }>(`/api/shelters/${enc(id)}`).then((r) => r.shelter),

  tap: (shelterId: string, action: TagAction, k: string, tapId: string) =>
    send<TapResponse>('POST', `/api/tags/${enc(shelterId)}/${action}`, { k, tap_id: tapId }),
  undo: (tapId: string) => send<UndoResponse>('POST', '/api/undo', { tap_id: tapId }),

  createHold: (shelterId: string, worker: Worker) =>
    send<HoldWithShelter>('POST', '/api/holds', {
      shelter_id: shelterId,
      worker_name: worker.name,
      worker_org: worker.org,
    }),
  hold: (id: string) => request<HoldWithShelter>(`/api/holds/${enc(id)}`),
  arriveHold: (id: string) => send<HoldWithShelter>('POST', `/api/holds/${enc(id)}/arrive`),
  cancelHold: (id: string) => send<HoldWithShelter>('DELETE', `/api/holds/${enc(id)}`),

  matchVoice: (transcript: string, coords?: { lat: number; lng: number } | null) =>
    send<VoiceMatchResponse>('POST', '/api/match', {
      transcript,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    }),
  speak: (text: string) => send<SpeakResponse>('POST', '/api/speak', { text }),
}

/** Shelter staff portal. Every call needs the shelter's staff key. */
export const staffApi = {
  detail: (id: string, auth: StaffAuth) =>
    request<StaffDetail>(`/api/staff/${enc(id)}`, { headers: staffHeaders(auth) }),
  setCount: (id: string, auth: StaffAuth, openBeds: number) =>
    send<StaffChange>('POST', `/api/staff/${enc(id)}/count`, { open_beds: openBeds }, staffHeaders(auth)),
  adjust: (id: string, auth: StaffAuth, delta: 1 | -1) =>
    send<StaffChange>('POST', `/api/staff/${enc(id)}/adjust`, { delta }, staffHeaders(auth)),
  markFull: (id: string, auth: StaffAuth) => send<StaffChange>('POST', `/api/staff/${enc(id)}/full`, {}, staffHeaders(auth)),
  reopen: (id: string, auth: StaffAuth, openBeds: number) =>
    send<StaffChange>('POST', `/api/staff/${enc(id)}/open`, { open_beds: openBeds }, staffHeaders(auth)),
  revert: (id: string, auth: StaffAuth, eventId: number) =>
    send<StaffChange>('POST', `/api/staff/${enc(id)}/events/${eventId}/revert`, {}, staffHeaders(auth)),
  settings: (id: string, auth: StaffAuth, settings: StaffSettings) =>
    send<StaffChange>('PATCH', `/api/staff/${enc(id)}/settings`, settings, staffHeaders(auth)),
  rotateTag: (id: string, auth: StaffAuth, action: TagAction | 'all') =>
    send<{ status: 'rotated'; rotated: TagAction[]; tags: TagLink[] }>(
      'POST', `/api/staff/${enc(id)}/tags/rotate`, { action }, staffHeaders(auth)),
  releaseHold: (id: string, auth: StaffAuth, holdId: string) =>
    send<StaffChange>('DELETE', `/api/staff/${enc(id)}/holds/${enc(holdId)}`, undefined, staffHeaders(auth)),
}

/** Admin / test hub (DEV_TOOLS_ENABLED only). */
export const adminApi = {
  shelters: (key: string) =>
    request<{ shelters: AdminShelter[] }>('/api/admin/shelters', { headers: { 'X-Admin-Key': key } }).then((r) => r.shelters),
  resetDemo: (key: string) =>
    send<{ status: 'reset'; shelters: number; holds_cancelled: number }>('POST', '/api/admin/reset-demo', {}, { 'X-Admin-Key': key }),
  expireHolds: (key: string) => send<{ expired: number }>('POST', '/api/admin/expire-holds', {}, { 'X-Admin-Key': key }),
  makeStale: (key: string, id: string) =>
    send<{ shelter: Shelter }>('POST', `/api/admin/shelters/${enc(id)}/stale`, {}, { 'X-Admin-Key': key }),
  voice: (key: string, transcript: string) =>
    send<VoiceSimResult>('POST', '/api/dev/voice', { transcript }, { 'X-Admin-Key': key }),
  sms: (key: string, from: string, body: string) =>
    send<SmsSimResult>('POST', '/api/dev/sms', { from, body }, { 'X-Admin-Key': key }),
}
