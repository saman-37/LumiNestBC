import { Accessibility, Heart, PawPrint, Sparkles, Users, Venus, type LucideIcon } from 'lucide-react'
import type { FilterKey, Shelter } from './types'

export const FILTERS: { key: FilterKey; label: string; short: string; Icon: LucideIcon }[] = [
  { key: 'women_only', label: 'Women only', short: 'Women', Icon: Venus },
  { key: 'youth', label: 'Youth', short: 'Youth', Icon: Sparkles },
  { key: 'families', label: 'Families', short: 'Families', Icon: Users },
  { key: 'pets_ok', label: 'Pets OK', short: 'Pets OK', Icon: PawPrint },
  { key: 'accessible', label: 'Accessible', short: 'Accessible', Icon: Accessibility },
  { key: 'couples', label: 'Couples', short: 'Couples', Icon: Heart },
]

export function matchesFilters(shelter: Shelter, active: Set<FilterKey>): boolean {
  for (const key of active) if (!shelter[key]) return false
  return true
}

/**
 * How a shelter reads at a glance. Stale (3 h+) wins: an old count is "unconfirmed"
 * whatever it says.
 */
export type ShelterState = 'open' | 'open-one' | 'full' | 'stale'

export function shelterState(s: Shelter): ShelterState {
  if (s.freshness === 'red') return 'stale'
  if (s.is_full || s.open_beds < 1) return 'full'
  return s.open_beds >= 2 ? 'open' : 'open-one'
}

export function isOpen(s: Shelter): boolean {
  const state = shelterState(s)
  return state === 'open' || state === 'open-one'
}

/** At least one open bed reported (stale counts included; they show as "unconfirmed"). */
export function hasBeds(s: Shelter): boolean {
  return s.open_beds > 0 && !s.is_full
}

export function bedsWord(n: number): string {
  return n === 1 ? 'bed' : 'beds'
}
