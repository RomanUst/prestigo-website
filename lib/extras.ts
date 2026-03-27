import type { Extras } from '@/types/booking'

// TODO: set production extras prices — these are placeholders
export const EXTRAS_PRICES: Record<keyof Extras, number> = {
  childSeat: 15,
  meetAndGreet: 25,
  extraLuggage: 20,
}

export const EXTRAS_CONFIG: { key: keyof Extras; label: string; description: string; price: number }[] = [
  { key: 'childSeat', label: 'Child Seat', description: 'Safety seat for children up to 36 kg', price: EXTRAS_PRICES.childSeat },
  { key: 'meetAndGreet', label: 'Meet & Greet', description: 'Name board at arrivals', price: EXTRAS_PRICES.meetAndGreet },
  { key: 'extraLuggage', label: 'Extra Luggage', description: 'Additional luggage allowance', price: EXTRAS_PRICES.extraLuggage },
]

export function computeExtrasTotal(extras: Extras): number {
  return Object.entries(EXTRAS_PRICES).reduce(
    (sum, [key, price]) => sum + (extras[key as keyof Extras] ? price : 0),
    0
  )
}
