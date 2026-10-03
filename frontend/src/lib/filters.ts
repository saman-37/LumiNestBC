import { Accessibility, Baby, HeartHandshake, PawPrint, UserRound, Venus, type LucideIcon } from 'lucide-react'
import type { FilterKey } from './types'

export const FILTERS: { key: FilterKey; label: string; Icon: LucideIcon }[] = [
  { key: 'women_only', label: 'Women only', Icon: Venus },
  { key: 'youth', label: 'Youth', Icon: UserRound },
  { key: 'families', label: 'Families', Icon: Baby },
  { key: 'pets_ok', label: 'Pets OK', Icon: PawPrint },
  { key: 'accessible', label: 'Accessible', Icon: Accessibility },
  { key: 'couples', label: 'Couples', Icon: HeartHandshake },
]

export function lightLevel(openBeds: number, isFull: boolean): 'strong' | 'dim' | 'off' {
  if (isFull || openBeds < 1) return 'off'
  return openBeds >= 2 ? 'strong' : 'dim'
}
