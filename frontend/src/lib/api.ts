import type {
  AvailabilityEvent,
  Hold,
  HoldWithShelter,
  Shelter,
  SpeakResponse,
  TagAction,
  TapResponse,
  UndoResponse,
  VoiceMatchResponse,
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

function send<T>(method: 'POST' | 'DELETE', path: string, data?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
}

const enc = encodeURIComponent

export const api = {
  shelters: () => request<{ shelters: Shelter[] }>('/api/shelters').then((r) => r.shelters),
  shelter: (id: string) => request<{ shelter: Shelter }>(`/api/shelters/${enc(id)}`).then((r) => r.shelter),
  shelterHolds: (id: string) =>
    request<{ holds: Hold[] }>(`/api/shelters/${enc(id)}/holds`).then((r) => r.holds),
  shelterEvents: (id: string, limit = 20) =>
    request<{ events: AvailabilityEvent[] }>(`/api/shelters/${enc(id)}/events?limit=${limit}`).then(
      (r) => r.events,
    ),

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
