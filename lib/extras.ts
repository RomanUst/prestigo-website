import type { Extras } from '@/types/booking'

export const EXTRAS_PRICES: Record<keyof Extras, number> = {
  infantSeat:    0,
  childSeat:     0,
  boosterSeat:   0,
  meetAndGreet:  0,
  extraLuggage:  0,
}

export type ExtrasConfigItem = {
  key: keyof Extras
  label: string
  description: string
  price: number
  alwaysSelected?: boolean
}

export const EXTRAS_CONFIG: ExtrasConfigItem[] = [
  {
    key: 'meetAndGreet',
    label: 'Meet & Greet',
    description: 'Driver with name board at arrivals — always included',
    price: 0,
    alwaysSelected: true,
  },
  {
    key: 'infantSeat',
    label: 'Infant Seat (0–9 kg)',
    description: 'Rear-facing infant carrier for newborns and young infants',
    price: 0,
  },
  {
    key: 'childSeat',
    label: 'Child Seat (18–36 kg)',
    description: 'Forward-facing safety seat for toddlers and older children',
    price: 0,
  },
  {
    key: 'boosterSeat',
    label: 'Booster Seat',
    description: 'Booster cushion for children who have outgrown a child seat',
    price: 0,
  },
]

export function computeExtrasTotal(
  _extras: Extras,
  _prices?: Record<keyof Extras, number>
): number {
  return 0
}
