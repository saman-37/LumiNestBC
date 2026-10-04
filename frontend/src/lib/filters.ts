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
 * How a shelter reads at a glance. Freshness never changes it: an old count is shown like any
 * other, with its "Updated 4 h ago" line coloured amber or red.
 */
export type ShelterState = 'open' | 'open-one' | 'full'

export function shelterState(s: Shelter): ShelterState {
  if (!s.accepting) return 'full' // staff turned off "accepting new people" tonight
  if (s.is_full || s.open_beds < 1) return 'full'
  return s.open_beds >= 2 ? 'open' : 'open-one'
}

export function isOpen(s: Shelter): boolean {
  const state = shelterState(s)
  return state === 'open' || state === 'open-one'
}

/** At least one open bed reported, and accepting people. */
export function hasBeds(s: Shelter): boolean {
  return s.open_beds > 0 && !s.is_full && s.accepting
}

export function bedsWord(n: number): string {
  return n === 1 ? 'bed' : 'beds'
}
